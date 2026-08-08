-- Phase 1E-2A / M1: canonical Task State schema foundation.
--
-- This artifact is schema-only.  It deliberately does not backfill legacy
-- Tasks or History, create migration support, or install runtime command
-- functions.  Canonical semantic columns on existing Tasks remain nullable
-- until the separately authorized migration backfill proves their values.

create extension if not exists pgcrypto;

create table if not exists public.adhdice_task_state_schema_contract (
  contract_key text primary key,
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.adhdice_task_state_schema_contract (
  contract_key,
  schema_contract_version
)
values (
  'canonical_task_state',
  'task-state-schema-v1'
)
on conflict (contract_key) do nothing;

-- The profile's timezone and day-start values are existing logical-day
-- settings supplied by earlier profile/rollover patches.  IF NOT EXISTS keeps
-- this artifact safe when those patches have already been applied, while the
-- settings revision is the new canonical addition owned by this phase.
alter table public.adhdice_user_profiles
  add column if not exists timezone text not null default 'America/New_York',
  add column if not exists day_start_time text not null default '06:00',
  add column if not exists settings_revision bigint not null default 1;

-- Keep the logical-day settings revision database-owned.  A client-supplied
-- settings_revision is ignored and cannot advance the generation unless one
-- of the canonical settings actually changes in the same profile update.
create or replace function public.adhdice_user_profiles_bump_settings_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.timezone is distinct from old.timezone
     or new.day_start_time is distinct from old.day_start_time then
    new.settings_revision := old.settings_revision + 1;
  else
    new.settings_revision := old.settings_revision;
  end if;

  return new;
end;
$function$;

revoke all on function public.adhdice_user_profiles_bump_settings_revision() from public, anon, authenticated;

drop trigger if exists adhdice_user_profiles_bump_settings_revision
  on public.adhdice_user_profiles;
create trigger adhdice_user_profiles_bump_settings_revision
  before update of timezone, day_start_time, settings_revision
  on public.adhdice_user_profiles
  for each row execute function public.adhdice_user_profiles_bump_settings_revision();

alter table public.adhdice_clean_tasks
  add column if not exists canonicalization_status text not null default 'legacy_uninitialized',
  add column if not exists entity_kind text,
  add column if not exists terminal_state text,
  add column if not exists container_state text,
  add column if not exists prior_container_state text,
  add column if not exists prior_container_state_status text,
  add column if not exists terminal_completed_at timestamptz,
  add column if not exists container_trashed_at timestamptz,
  add column if not exists workflow_state text,
  add column if not exists workflow_started_at timestamptz,
  add column if not exists workflow_logical_date date,
  add column if not exists workflow_occurrence_id uuid,
  add column if not exists workflow_command_id uuid,
  add column if not exists workflow_revision bigint,
  add column if not exists canonical_revision bigint,
  add column if not exists canonical_created_at timestamptz,
  add column if not exists canonical_updated_at timestamptz,
  add column if not exists projection_source_canonical_revision bigint,
  add column if not exists projection_source_fingerprint text,
  add column if not exists projection_version text;

-- Add constraints to the existing Task/profile tables by name so rerunning
-- this patch does not duplicate them.  The Task checks are NULL-tolerant for
-- legacy_uninitialized and needs_attention rows and become complete semantic
-- checks for canonical_proven/canonical_runtime rows.
do $ddl$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_user_profiles'::regclass
      and conname = 'adhdice_user_profiles_timezone_nonempty_check'
  ) then
    alter table public.adhdice_user_profiles
      add constraint adhdice_user_profiles_timezone_nonempty_check
      check (char_length(trim(timezone)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_user_profiles'::regclass
      and conname = 'adhdice_user_profiles_day_start_time_format_check'
  ) then
    alter table public.adhdice_user_profiles
      add constraint adhdice_user_profiles_day_start_time_format_check
      check (day_start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_user_profiles'::regclass
      and conname = 'adhdice_user_profiles_settings_revision_check'
  ) then
    alter table public.adhdice_user_profiles
      add constraint adhdice_user_profiles_settings_revision_check
      check (settings_revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_canonicalization_status_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_canonicalization_status_check
      check (canonicalization_status in (
        'legacy_uninitialized', 'canonical_proven', 'canonical_runtime', 'needs_attention'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_entity_kind_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_entity_kind_check
      check (entity_kind is null or entity_kind in ('parent', 'step', 'substep'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_terminal_state_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_terminal_state_check
      check (terminal_state is null or terminal_state in ('active', 'permanently_complete'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_container_state_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_container_state_check
      check (container_state is null or container_state in ('active', 'archived', 'trashed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_prior_container_state_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_prior_container_state_check
      check (prior_container_state is null or prior_container_state in ('active', 'archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_prior_container_state_status_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_prior_container_state_status_check
      check (prior_container_state_status is null or prior_container_state_status in (
        'not_applicable', 'proven', 'unknown', 'contradictory'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_workflow_state_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_workflow_state_check
      check (workflow_state is null or workflow_state in ('none', 'in_progress'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_workflow_revision_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_workflow_revision_check
      check (workflow_revision is null or workflow_revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_canonical_revision_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_canonical_revision_check
      check (canonical_revision is null or canonical_revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_projection_source_revision_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_projection_source_revision_check
      check (projection_source_canonical_revision is null or projection_source_canonical_revision >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_projection_source_fields_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_projection_source_fields_check
      check (
        (projection_source_canonical_revision is null
          and projection_source_fingerprint is null
          and projection_version is null)
        or
        (projection_source_canonical_revision is not null
          and projection_source_fingerprint is not null
          and char_length(trim(projection_source_fingerprint)) > 0
          and projection_version is not null
          and char_length(trim(projection_version)) > 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_canonical_semantics_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_canonical_semantics_check
      check (
        canonicalization_status in ('legacy_uninitialized', 'needs_attention')
        or (
          entity_kind is not null
          and terminal_state is not null
          and container_state is not null
          and prior_container_state_status is not null
          and workflow_state is not null
          and workflow_revision is not null
          and canonical_revision is not null
          and canonical_created_at is not null
          and canonical_updated_at is not null
          and (
            terminal_state = 'active'
            or terminal_completed_at is not null
          )
          and (
            terminal_state = 'permanently_complete'
            or terminal_completed_at is null
          )
          and (
            workflow_state = 'none'
            or (
              workflow_started_at is not null
              and workflow_logical_date is not null
              and workflow_command_id is not null
            )
          )
          and (
            workflow_state = 'in_progress'
            or (
              workflow_started_at is null
              and workflow_logical_date is null
              and workflow_occurrence_id is null
              and workflow_command_id is null
            )
          )
          and (
            container_state <> 'trashed'
            or container_trashed_at is not null
          )
          and (
            container_state = 'trashed'
            or container_trashed_at is null
          )
          and (
            prior_container_state_status <> 'proven'
            or prior_container_state is not null
          )
          and (
            prior_container_state_status <> 'not_applicable'
            or container_state <> 'trashed'
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.adhdice_clean_tasks'::regclass
      and conname = 'adhdice_clean_tasks_user_id_id_key'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_user_id_id_key unique (user_id, id);
  end if;
end;
$ddl$;

create table if not exists public.adhdice_task_command_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid,
  entity_kind text,
  command_id uuid not null,
  command_type text not null check (command_type in (
    'set_outcome', 'clear_outcome', 'complete_task', 'delay_occurrence',
    'set_due_date', 'set_repeat', 'calendar_override', 'archive_task',
    'trash_task', 'restore_task', 'start_in_progress', 'clear_in_progress',
    'reconcile_rollover', 'hierarchy_change'
  )),
  idempotence_identity text not null
    check (char_length(trim(idempotence_identity)) > 0),
  accepted_payload_digest text not null
    check (char_length(trim(accepted_payload_digest)) > 0),
  logical_day_context_identity text,
  requested_logical_date date,
  requested_occurrence_key text,
  expected_entity_revision bigint check (expected_entity_revision is null or expected_entity_revision >= 1),
  expected_history_revision bigint check (expected_history_revision is null or expected_history_revision >= 1),
  expected_boundary_sequence bigint check (expected_boundary_sequence is null or expected_boundary_sequence >= 1),
  expected_occurrence_revision bigint check (expected_occurrence_revision is null or expected_occurrence_revision >= 1),
  expected_facts_fingerprint text,
  state text not null default 'accepted' check (state in (
    'accepted', 'rejected', 'committed', 'failed_retryable',
    'failed_permanent', 'needs_explicit_resolution'
  )),
  result_digest text,
  result_references jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_references) = 'object'),
  conflict_code text,
  source_kind text not null check (source_kind in (
    'runtime', 'authorized_automation', 'repair'
  )),
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint adhdice_task_command_operations_entity_shape_check check (
    (entity_id is null and entity_kind is null)
    or (entity_id is not null and entity_kind in ('parent', 'step', 'substep'))
  ),
  constraint adhdice_task_command_operations_id_key unique (user_id, id),
  constraint adhdice_task_command_operations_idempotence_key
    unique (user_id, idempotence_identity),
  constraint adhdice_task_command_operations_command_key unique (user_id, command_id)
);

create table if not exists public.adhdice_task_schedule_boundaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),
  effective_from_logical_date date not null,
  boundary_sequence bigint not null check (boundary_sequence >= 1),
  boundary_type text not null check (boundary_type in (
    'initial', 'due_date_change', 'repeat_change', 'delay', 'correction', 'reopen'
  )),
  schedule_model text not null check (schedule_model in (
    'unscheduled', 'one_time', 'rolling', 'fixed'
  )),
  repeat_frequency text not null check (repeat_frequency in (
    'none', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete'
  )),
  repeat_interval integer not null default 1 check (repeat_interval > 0),
  repeat_days_of_week smallint[] not null default '{}'
    check (
      cardinality(repeat_days_of_week) between 0 and 7
      and repeat_days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
    ),
  repeat_day_of_month integer
    check (repeat_day_of_month is null or repeat_day_of_month between 1 and 31),
  repeat_monthly_mode text not null default 'day_of_month'
    check (repeat_monthly_mode in ('day_of_month', 'ordinal_weekday')),
  repeat_monthly_ordinal text
    check (repeat_monthly_ordinal is null or repeat_monthly_ordinal in (
      'first', 'second', 'third', 'fourth', 'last'
    )),
  repeat_monthly_weekday smallint
    check (repeat_monthly_weekday is null or repeat_monthly_weekday between 0 and 6),
  one_time_due_on date,
  due_time time without time zone,
  anchor_date date,
  anchor_kind text not null check (anchor_kind in (
    'user_selected', 'first_schedule_boundary', 'reconstructed',
    'migration_prospective', 'unknown'
  )),
  anchor_confidence text not null check (anchor_confidence in (
    'proven', 'high_confidence', 'ambiguous', 'unavailable'
  )),
  historical_scope_known boolean not null,
  prospective_only boolean not null default false,
  prior_boundary_id uuid,
  affected_occurrence_id uuid,
  logical_day_settings_revision bigint not null check (logical_day_settings_revision >= 1),
  timezone text not null check (char_length(trim(timezone)) > 0),
  day_start_time time without time zone not null,
  actor_kind text not null check (actor_kind in (
    'user', 'authorized_automation', 'migration', 'repair'
  )),
  actor_id uuid,
  source text not null check (char_length(trim(source)) > 0),
  command_id uuid,
  idempotence_identity text not null
    check (char_length(trim(idempotence_identity)) > 0),
  migration_operation_id uuid,
  migration_version text,
  classifier_version text,
  schema_contract_version text not null
    check (schema_contract_version = 'task-state-schema-v1'),
  source_task_revision bigint check (source_task_revision is null or source_task_revision >= 1),
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_schedule_boundaries_id_key unique (user_id, id),
  constraint adhdice_task_schedule_boundaries_sequence_key
    unique (user_id, entity_id, boundary_sequence),
  constraint adhdice_task_schedule_boundaries_model_check check (
    (
      schedule_model = 'unscheduled'
      and repeat_frequency = 'none'
      and one_time_due_on is null
      and anchor_date is null
    )
    or (
      schedule_model = 'one_time'
      and repeat_frequency = 'none'
      and one_time_due_on is not null
    )
    or (
      schedule_model in ('rolling', 'fixed')
      and repeat_frequency <> 'none'
    )
  ),
  constraint adhdice_task_schedule_boundaries_monthly_fields_check check (
    (
      repeat_monthly_mode = 'day_of_month'
      and repeat_monthly_ordinal is null
      and repeat_monthly_weekday is null
    )
    or (
      repeat_monthly_mode = 'ordinal_weekday'
      and repeat_monthly_ordinal is not null
      and repeat_monthly_weekday is not null
    )
  ),
  constraint adhdice_task_schedule_boundaries_anchor_check check (
    (
      anchor_confidence in ('proven', 'high_confidence')
      and anchor_date is not null
    )
    or anchor_confidence in ('ambiguous', 'unavailable')
  ),
  constraint adhdice_task_schedule_boundaries_unknown_anchor_check check (
    anchor_kind <> 'unknown' or anchor_date is null
  ),
  constraint adhdice_task_schedule_boundaries_prospective_check check (
    not prospective_only or not historical_scope_known
  ),
  constraint adhdice_task_schedule_boundaries_initial_check check (
    (boundary_type = 'initial' and prior_boundary_id is null)
    or (boundary_type <> 'initial' and prior_boundary_id is not null)
  ),
  constraint adhdice_task_schedule_boundaries_affected_occurrence_check check (
    boundary_type = 'delay' or affected_occurrence_id is null
  ),
  constraint adhdice_task_schedule_boundaries_actor_check check (
    (actor_kind in ('user', 'repair') and actor_id is not null)
    or (actor_kind in ('authorized_automation', 'migration') and actor_id is null)
  ),
  constraint adhdice_task_schedule_boundaries_migration_provenance_check check (
    actor_kind <> 'migration'
    or (migration_version is not null and classifier_version is not null)
  )
);

create table if not exists public.adhdice_task_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),
  occurrence_key text not null,
  scheduled_due_on date not null,
  source_boundary_id uuid not null,
  recurrence_source_fingerprint text not null
    check (char_length(trim(recurrence_source_fingerprint)) > 0),
  origin_kind text not null check (origin_kind in (
    'proven', 'reconstructed', 'legacy_ambiguous'
  )),
  origin_confidence text not null check (origin_confidence in (
    'proven', 'high_confidence', 'ambiguous', 'unavailable'
  )),
  provenance_kind text not null check (provenance_kind in (
    'user', 'authorized_automation', 'migration_reconstruction', 'repair'
  )),
  actor_kind text not null check (actor_kind in (
    'user', 'authorized_automation', 'migration', 'repair'
  )),
  actor_id uuid,
  source text not null check (char_length(trim(source)) > 0),
  materialization_reason text not null check (materialization_reason in (
    'explicit_outcome', 'delay', 'complete', 'migration_reconstruction',
    'manual_correction', 'required_command_state'
  )),
  resolution_state text not null default 'unresolved'
    check (resolution_state in ('unresolved', 'resolved', 'superseded')),
  resolved_logical_date date,
  resolved_outcome text check (resolved_outcome is null or resolved_outcome in (
    'done', 'did_my_best', 'missed', 'delayed', 'complete'
  )),
  resolved_history_id uuid,
  command_id uuid,
  migration_operation_id uuid,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_occurrences_id_key unique (user_id, id),
  constraint adhdice_task_occurrences_entity_date_key
    unique (user_id, entity_id, scheduled_due_on),
  constraint adhdice_task_occurrences_key_key unique (user_id, occurrence_key),
  constraint adhdice_task_occurrences_id_date_key
    unique (user_id, id, scheduled_due_on),
  constraint adhdice_task_occurrences_key_shape_check check (
    occurrence_key = 'task:' || entity_id::text || ':occurrence:' || scheduled_due_on::text
  ),
  constraint adhdice_task_occurrences_resolution_check check (
    (
      resolution_state = 'unresolved'
      and resolved_logical_date is null
      and resolved_outcome is null
      and resolved_history_id is null
    )
    or (
      resolution_state in ('resolved', 'superseded')
      and resolved_logical_date is not null
      and resolved_outcome is not null
    )
  ),
  constraint adhdice_task_occurrences_actor_check check (
    (actor_kind in ('user', 'repair') and actor_id is not null)
    or (actor_kind in ('authorized_automation', 'migration') and actor_id is null)
  ),
  constraint adhdice_task_occurrences_migration_provenance_check check (
    provenance_kind <> 'migration_reconstruction' or actor_kind = 'migration'
  )
);

create table if not exists public.adhdice_task_occurrence_effective_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  occurrence_id uuid not null,
  scheduled_due_on date not null,
  effective_due_on date not null,
  action_logical_date date not null,
  delay_kind text not null check (delay_kind in ('delay', 'correction')),
  override_sequence bigint not null check (override_sequence >= 1),
  prior_override_id uuid,
  prior_override_sequence bigint,
  schedule_boundary_id uuid not null,
  history_id uuid,
  provenance_kind text not null check (provenance_kind in (
    'user', 'authorized_automation', 'migration_reconstruction', 'repair'
  )),
  actor_kind text not null check (actor_kind in (
    'user', 'authorized_automation', 'migration', 'repair'
  )),
  actor_id uuid,
  source text not null check (char_length(trim(source)) > 0),
  command_id uuid,
  idempotence_identity text not null
    check (char_length(trim(idempotence_identity)) > 0),
  migration_operation_id uuid,
  accepted_payload_digest text not null
    check (char_length(trim(accepted_payload_digest)) > 0),
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_occurrence_effective_overrides_id_key
    unique (user_id, id),
  constraint adhdice_task_occurrence_effective_overrides_identity_key
    unique (user_id, occurrence_id, idempotence_identity),
  constraint adhdice_task_occurrence_effective_overrides_sequence_key
    unique (user_id, occurrence_id, override_sequence),
  constraint adhdice_task_occurrence_effective_overrides_prior_id_key
    unique (user_id, occurrence_id, id),
  constraint adhdice_task_occurrence_effective_overrides_date_check
    check (effective_due_on > action_logical_date),
  constraint adhdice_task_occurrence_effective_overrides_predecessor_check check (
    (
      override_sequence = 1
      and prior_override_id is null
      and prior_override_sequence is null
    )
    or (
      override_sequence > 1
      and prior_override_id is not null
      and prior_override_sequence = override_sequence - 1
    )
  ),
  constraint adhdice_task_occurrence_effective_overrides_actor_check check (
    (actor_kind in ('user', 'repair') and actor_id is not null)
    or (actor_kind in ('authorized_automation', 'migration') and actor_id is null)
  ),
  constraint adhdice_task_occurrence_effective_overrides_migration_check check (
    provenance_kind <> 'migration_reconstruction' or actor_kind = 'migration'
  )
);

create table if not exists public.adhdice_task_history_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),
  logical_date date not null,
  outcome text not null check (outcome in (
    'done', 'did_my_best', 'missed', 'delayed', 'complete'
  )),
  event_kind text not null check (event_kind in (
    'explicit_outcome', 'terminal_complete', 'delay_audit',
    'correction', 'authorized_automation'
  )),
  occurrence_id uuid,
  scheduled_due_on date,
  effective_due_on date,
  schedule_boundary_id uuid,
  recurrence_source_fingerprint text,
  provenance_kind text not null check (provenance_kind in (
    'user', 'authorized_automation', 'migration_reconstruction', 'repair'
  )),
  actor_kind text not null check (actor_kind in (
    'user', 'authorized_automation', 'migration', 'repair'
  )),
  actor_id uuid,
  source text not null check (char_length(trim(source)) > 0),
  logical_day_settings_revision bigint not null check (logical_day_settings_revision >= 1),
  timezone text not null check (char_length(trim(timezone)) > 0),
  day_start_time time without time zone not null,
  command_id uuid,
  idempotence_identity text not null
    check (char_length(trim(idempotence_identity)) > 0),
  migration_operation_id uuid,
  source_legacy_history_id uuid,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_history_facts_id_key unique (user_id, id),
  constraint adhdice_task_history_facts_entity_date_key
    unique (user_id, entity_id, logical_date),
  constraint adhdice_task_history_facts_event_outcome_check check (
    (event_kind = 'terminal_complete' and outcome = 'complete')
    or event_kind <> 'terminal_complete'
  ),
  constraint adhdice_task_history_facts_delay_check check (
    (event_kind = 'delay_audit' and outcome = 'delayed')
    or event_kind <> 'delay_audit'
  ),
  constraint adhdice_task_history_facts_effective_date_check check (
    (
      outcome = 'delayed'
      and effective_due_on is not null
      and effective_due_on > logical_date
    )
    or (
      outcome <> 'delayed'
      and (effective_due_on is null or event_kind = 'correction')
    )
  ),
  constraint adhdice_task_history_facts_occurrence_check check (
    occurrence_id is null or scheduled_due_on is not null
  ),
  constraint adhdice_task_history_facts_runtime_provenance_check check (
    (
      provenance_kind = 'migration_reconstruction'
      and migration_operation_id is not null
      and command_id is null
    )
    or (
      provenance_kind <> 'migration_reconstruction'
      and migration_operation_id is null
      and command_id is not null
    )
  ),
  constraint adhdice_task_history_facts_actor_check check (
    (actor_kind in ('user', 'repair') and actor_id is not null)
    or (actor_kind in ('authorized_automation', 'migration') and actor_id is null)
  )
);

create table if not exists public.adhdice_task_calendar_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),
  logical_date date not null,
  override_state text not null check (override_state in (
    'unscheduled', 'not_due', 'due_open'
  )),
  reason text check (reason is null or char_length(trim(reason)) > 0),
  is_active boolean not null default true,
  cleared_at timestamptz,
  cleared_by_command_id uuid,
  provenance_kind text not null check (provenance_kind in (
    'manual', 'authorized_repair', 'migration'
  )),
  actor_kind text not null check (actor_kind in (
    'user', 'authorized_automation', 'migration', 'repair'
  )),
  actor_id uuid,
  source text not null check (char_length(trim(source)) > 0),
  command_id uuid,
  idempotence_identity text not null
    check (char_length(trim(idempotence_identity)) > 0),
  migration_operation_id uuid,
  revision bigint not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adhdice_task_calendar_overrides_clear_check check (
    (is_active and cleared_at is null)
    or (not is_active and cleared_at is not null)
  ),
  constraint adhdice_task_calendar_overrides_actor_check check (
    (actor_kind in ('user', 'repair') and actor_id is not null)
    or (actor_kind in ('authorized_automation', 'migration') and actor_id is null)
  )
);

create table if not exists public.adhdice_task_reward_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),
  logical_date date not null,
  reward_program_version text not null
    check (char_length(trim(reward_program_version)) > 0),
  canonical_history_id uuid not null,
  canonical_command_id uuid,
  canonical_event_identity text not null
    check (char_length(trim(canonical_event_identity)) > 0),
  outcome_snapshot text not null check (outcome_snapshot in (
    'done', 'did_my_best', 'complete'
  )),
  effective_obligation_identity text,
  eligibility_kind text not null check (eligibility_kind in (
    'handled_success', 'authorized_automation'
  )),
  entitlement_source_kind text not null check (entitlement_source_kind in (
    'runtime_command', 'migration_bootstrap'
  )),
  state text not null default 'pending' check (state in (
    'pending', 'fulfilled', 'blocked'
  )),
  migration_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  constraint adhdice_task_reward_entitlements_id_key unique (user_id, id),
  constraint adhdice_task_reward_entitlements_identity_key
    unique (user_id, entity_id, logical_date, reward_program_version),
  constraint adhdice_task_reward_entitlements_source_check check (
    (
      entitlement_source_kind = 'runtime_command'
      and canonical_command_id is not null
      and migration_operation_id is null
    )
    or (
      entitlement_source_kind = 'migration_bootstrap'
      and canonical_command_id is null
      and migration_operation_id is not null
    )
  ),
  constraint adhdice_task_reward_entitlements_fulfillment_check check (
    state <> 'fulfilled' or fulfilled_at is not null
  )
);

create table if not exists public.adhdice_task_reward_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_id uuid not null,
  grant_operation_identity text not null
    check (char_length(trim(grant_operation_identity)) > 0),
  grant_kind text not null default 'banked_roll'
    check (grant_kind = 'banked_roll'),
  units integer not null default 1 check (units > 0),
  grant_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(grant_payload) = 'object'),
  state text not null default 'pending' check (state in (
    'pending', 'applied', 'failed', 'reconciled'
  )),
  last_error_code text,
  last_error_message text,
  economy_reference text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint adhdice_task_reward_grants_id_key unique (user_id, id),
  constraint adhdice_task_reward_grants_entitlement_kind_key
    unique (user_id, entitlement_id, grant_kind),
  constraint adhdice_task_reward_grants_operation_key
    unique (user_id, grant_operation_identity)
);

create table if not exists public.adhdice_task_reward_claim_consumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null,
  claim_operation_identity text not null
    check (char_length(trim(claim_operation_identity)) > 0),
  state text not null default 'pending' check (state in (
    'pending', 'consumed', 'failed'
  )),
  economy_reference text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint adhdice_task_reward_claim_consumptions_id_key unique (user_id, id),
  constraint adhdice_task_reward_claim_consumptions_grant_key unique (user_id, grant_id),
  constraint adhdice_task_reward_claim_consumptions_operation_key
    unique (user_id, claim_operation_identity),
  constraint adhdice_task_reward_claim_consumptions_consumed_check check (
    state <> 'consumed' or consumed_at is not null
  )
);

-- Composite owner-safe relationships are installed after all canonical tables
-- exist.  No user_id-only identity is trusted for a canonical relationship.
do $ddl$
begin
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_command_operations_entity_fkey') then
    alter table public.adhdice_task_command_operations
      add constraint adhdice_task_command_operations_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_schedule_boundaries_entity_fkey') then
    alter table public.adhdice_task_schedule_boundaries
      add constraint adhdice_task_schedule_boundaries_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_schedule_boundaries_prior_fkey') then
    alter table public.adhdice_task_schedule_boundaries
      add constraint adhdice_task_schedule_boundaries_prior_fkey
      foreign key (user_id, prior_boundary_id)
      references public.adhdice_task_schedule_boundaries (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_schedule_boundaries_affected_occurrence_fkey') then
    alter table public.adhdice_task_schedule_boundaries
      add constraint adhdice_task_schedule_boundaries_affected_occurrence_fkey
      foreign key (user_id, affected_occurrence_id)
      references public.adhdice_task_occurrences (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_schedule_boundaries_command_fkey') then
    alter table public.adhdice_task_schedule_boundaries
      add constraint adhdice_task_schedule_boundaries_command_fkey
      foreign key (user_id, command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrences_entity_fkey') then
    alter table public.adhdice_task_occurrences
      add constraint adhdice_task_occurrences_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrences_boundary_fkey') then
    alter table public.adhdice_task_occurrences
      add constraint adhdice_task_occurrences_boundary_fkey
      foreign key (user_id, source_boundary_id)
      references public.adhdice_task_schedule_boundaries (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrences_history_fkey') then
    alter table public.adhdice_task_occurrences
      add constraint adhdice_task_occurrences_history_fkey
      foreign key (user_id, resolved_history_id)
      references public.adhdice_task_history_facts (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrences_command_fkey') then
    alter table public.adhdice_task_occurrences
      add constraint adhdice_task_occurrences_command_fkey
      foreign key (user_id, command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrence_effective_overrides_entity_fkey') then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrence_effective_overrides_occurrence_fkey') then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_occurrence_fkey
      foreign key (user_id, occurrence_id, scheduled_due_on)
      references public.adhdice_task_occurrences (user_id, id, scheduled_due_on)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrence_effective_overrides_boundary_fkey') then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_boundary_fkey
      foreign key (user_id, schedule_boundary_id)
      references public.adhdice_task_schedule_boundaries (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrence_effective_overrides_history_fkey') then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_history_fkey
      foreign key (user_id, history_id)
      references public.adhdice_task_history_facts (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrence_effective_overrides_prior_id_fkey') then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_prior_id_fkey
      foreign key (user_id, occurrence_id, prior_override_id)
      references public.adhdice_task_occurrence_effective_overrides (user_id, occurrence_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrence_effective_overrides_prior_sequence_fkey') then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_prior_sequence_fkey
      foreign key (user_id, occurrence_id, prior_override_sequence)
      references public.adhdice_task_occurrence_effective_overrides (user_id, occurrence_id, override_sequence)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_occurrence_effective_overrides_command_fkey') then
    alter table public.adhdice_task_occurrence_effective_overrides
      add constraint adhdice_task_occurrence_effective_overrides_command_fkey
      foreign key (user_id, command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_history_facts_entity_fkey') then
    alter table public.adhdice_task_history_facts
      add constraint adhdice_task_history_facts_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_history_facts_occurrence_fkey') then
    alter table public.adhdice_task_history_facts
      add constraint adhdice_task_history_facts_occurrence_fkey
      foreign key (user_id, occurrence_id, scheduled_due_on)
      references public.adhdice_task_occurrences (user_id, id, scheduled_due_on)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_history_facts_boundary_fkey') then
    alter table public.adhdice_task_history_facts
      add constraint adhdice_task_history_facts_boundary_fkey
      foreign key (user_id, schedule_boundary_id)
      references public.adhdice_task_schedule_boundaries (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_history_facts_command_fkey') then
    alter table public.adhdice_task_history_facts
      add constraint adhdice_task_history_facts_command_fkey
      foreign key (user_id, command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_calendar_overrides_entity_fkey') then
    alter table public.adhdice_task_calendar_overrides
      add constraint adhdice_task_calendar_overrides_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_calendar_overrides_command_fkey') then
    alter table public.adhdice_task_calendar_overrides
      add constraint adhdice_task_calendar_overrides_command_fkey
      foreign key (user_id, command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_calendar_overrides_cleared_by_command_fkey') then
    alter table public.adhdice_task_calendar_overrides
      add constraint adhdice_task_calendar_overrides_cleared_by_command_fkey
      foreign key (user_id, cleared_by_command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_reward_entitlements_entity_fkey') then
    alter table public.adhdice_task_reward_entitlements
      add constraint adhdice_task_reward_entitlements_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_reward_entitlements_history_fkey') then
    alter table public.adhdice_task_reward_entitlements
      add constraint adhdice_task_reward_entitlements_history_fkey
      foreign key (user_id, canonical_history_id)
      references public.adhdice_task_history_facts (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_reward_entitlements_command_fkey') then
    alter table public.adhdice_task_reward_entitlements
      add constraint adhdice_task_reward_entitlements_command_fkey
      foreign key (user_id, canonical_command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_reward_grants_entitlement_fkey') then
    alter table public.adhdice_task_reward_grants
      add constraint adhdice_task_reward_grants_entitlement_fkey
      foreign key (user_id, entitlement_id)
      references public.adhdice_task_reward_entitlements (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_reward_claim_consumptions_grant_fkey') then
    alter table public.adhdice_task_reward_claim_consumptions
      add constraint adhdice_task_reward_claim_consumptions_grant_fkey
      foreign key (user_id, grant_id)
      references public.adhdice_task_reward_grants (user_id, id)
      on delete restrict;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'adhdice_clean_tasks_workflow_occurrence_fkey') then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_workflow_occurrence_fkey
      foreign key (user_id, workflow_occurrence_id)
      references public.adhdice_task_occurrences (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_clean_tasks_workflow_command_fkey') then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_workflow_command_fkey
      foreign key (user_id, workflow_command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;
end;
$ddl$;

create index if not exists adhdice_clean_tasks_canonical_scope_idx
  on public.adhdice_clean_tasks (user_id, entity_kind, container_state, terminal_state);
create index if not exists adhdice_clean_tasks_canonical_parent_sort_idx
  on public.adhdice_clean_tasks (user_id, parent_task_id, sort_order, id);

create index if not exists adhdice_task_schedule_boundaries_replay_idx
  on public.adhdice_task_schedule_boundaries
    (user_id, entity_id, effective_from_logical_date desc, boundary_sequence desc);
create index if not exists adhdice_task_schedule_boundaries_latest_idx
  on public.adhdice_task_schedule_boundaries (user_id, entity_id, boundary_sequence desc);
create index if not exists adhdice_task_schedule_boundaries_model_date_idx
  on public.adhdice_task_schedule_boundaries
    (user_id, schedule_model, effective_from_logical_date);
create index if not exists adhdice_task_schedule_boundaries_ancestry_idx
  on public.adhdice_task_schedule_boundaries (user_id, entity_id, prior_boundary_id);

create index if not exists adhdice_task_occurrences_entity_date_idx
  on public.adhdice_task_occurrences (user_id, entity_id, scheduled_due_on);
create index if not exists adhdice_task_occurrences_resolution_idx
  on public.adhdice_task_occurrences (user_id, entity_id, resolution_state, scheduled_due_on);
create index if not exists adhdice_task_occurrences_boundary_idx
  on public.adhdice_task_occurrences (user_id, source_boundary_id);
create index if not exists adhdice_task_occurrences_key_idx
  on public.adhdice_task_occurrences (user_id, occurrence_key);

create index if not exists adhdice_task_occurrence_effective_overrides_latest_idx
  on public.adhdice_task_occurrence_effective_overrides
    (user_id, occurrence_id, override_sequence desc);
create index if not exists adhdice_task_occurrence_effective_overrides_entity_date_idx
  on public.adhdice_task_occurrence_effective_overrides
    (user_id, entity_id, effective_due_on);

create index if not exists adhdice_task_history_facts_entity_date_idx
  on public.adhdice_task_history_facts (user_id, entity_id, logical_date desc);
create index if not exists adhdice_task_history_facts_date_updated_idx
  on public.adhdice_task_history_facts (user_id, logical_date desc, updated_at desc);
create index if not exists adhdice_task_history_facts_occurrence_idx
  on public.adhdice_task_history_facts (user_id, occurrence_id);

create unique index if not exists adhdice_task_calendar_overrides_active_key
  on public.adhdice_task_calendar_overrides (user_id, entity_id, logical_date)
  where is_active;
create index if not exists adhdice_task_calendar_overrides_active_entity_date_idx
  on public.adhdice_task_calendar_overrides (user_id, entity_id, logical_date)
  where is_active;
create index if not exists adhdice_task_calendar_overrides_user_date_idx
  on public.adhdice_task_calendar_overrides (user_id, logical_date desc);

create index if not exists adhdice_task_command_operations_command_idx
  on public.adhdice_task_command_operations (user_id, command_id);
create index if not exists adhdice_task_command_operations_entity_created_idx
  on public.adhdice_task_command_operations (user_id, entity_id, created_at desc);
create index if not exists adhdice_task_command_operations_state_created_idx
  on public.adhdice_task_command_operations (user_id, state, created_at);
create index if not exists adhdice_task_command_operations_requested_date_idx
  on public.adhdice_task_command_operations (user_id, requested_logical_date);

create index if not exists adhdice_task_reward_entitlements_state_idx
  on public.adhdice_task_reward_entitlements (user_id, state, created_at);
create index if not exists adhdice_task_reward_entitlements_entity_date_idx
  on public.adhdice_task_reward_entitlements (user_id, entity_id, logical_date desc);
create index if not exists adhdice_task_reward_entitlements_command_idx
  on public.adhdice_task_reward_entitlements (user_id, canonical_command_id);

create index if not exists adhdice_task_reward_grants_entitlement_idx
  on public.adhdice_task_reward_grants (user_id, entitlement_id);
create index if not exists adhdice_task_reward_claim_consumptions_grant_idx
  on public.adhdice_task_reward_claim_consumptions (user_id, grant_id);

create or replace function public.adhdice_task_state_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

revoke all on function public.adhdice_task_state_set_updated_at() from public, anon, authenticated;

drop trigger if exists adhdice_task_state_schema_contract_set_updated_at
  on public.adhdice_task_state_schema_contract;
create trigger adhdice_task_state_schema_contract_set_updated_at
  before update on public.adhdice_task_state_schema_contract
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_schedule_boundaries_set_updated_at
  on public.adhdice_task_schedule_boundaries;
create trigger adhdice_task_schedule_boundaries_set_updated_at
  before update on public.adhdice_task_schedule_boundaries
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_occurrences_set_updated_at
  on public.adhdice_task_occurrences;
create trigger adhdice_task_occurrences_set_updated_at
  before update on public.adhdice_task_occurrences
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_occurrence_effective_overrides_set_updated_at
  on public.adhdice_task_occurrence_effective_overrides;
create trigger adhdice_task_occurrence_effective_overrides_set_updated_at
  before update on public.adhdice_task_occurrence_effective_overrides
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_history_facts_set_updated_at
  on public.adhdice_task_history_facts;
create trigger adhdice_task_history_facts_set_updated_at
  before update on public.adhdice_task_history_facts
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_calendar_overrides_set_updated_at
  on public.adhdice_task_calendar_overrides;
create trigger adhdice_task_calendar_overrides_set_updated_at
  before update on public.adhdice_task_calendar_overrides
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_reward_entitlements_set_updated_at
  on public.adhdice_task_reward_entitlements;
create trigger adhdice_task_reward_entitlements_set_updated_at
  before update on public.adhdice_task_reward_entitlements
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_reward_grants_set_updated_at
  on public.adhdice_task_reward_grants;
create trigger adhdice_task_reward_grants_set_updated_at
  before update on public.adhdice_task_reward_grants
  for each row execute function public.adhdice_task_state_set_updated_at();

drop trigger if exists adhdice_task_reward_claim_consumptions_set_updated_at
  on public.adhdice_task_reward_claim_consumptions;
create trigger adhdice_task_reward_claim_consumptions_set_updated_at
  before update on public.adhdice_task_reward_claim_consumptions
  for each row execute function public.adhdice_task_state_set_updated_at();

alter table public.adhdice_task_state_schema_contract enable row level security;
alter table public.adhdice_task_command_operations enable row level security;
alter table public.adhdice_task_schedule_boundaries enable row level security;
alter table public.adhdice_task_occurrences enable row level security;
alter table public.adhdice_task_occurrence_effective_overrides enable row level security;
alter table public.adhdice_task_history_facts enable row level security;
alter table public.adhdice_task_calendar_overrides enable row level security;
alter table public.adhdice_task_reward_entitlements enable row level security;
alter table public.adhdice_task_reward_grants enable row level security;
alter table public.adhdice_task_reward_claim_consumptions enable row level security;

drop policy if exists "Users can read canonical command operations" on public.adhdice_task_command_operations;
create policy "Users can read canonical command operations"
  on public.adhdice_task_command_operations
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical schedule boundaries" on public.adhdice_task_schedule_boundaries;
create policy "Users can read canonical schedule boundaries"
  on public.adhdice_task_schedule_boundaries
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical occurrences" on public.adhdice_task_occurrences;
create policy "Users can read canonical occurrences"
  on public.adhdice_task_occurrences
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical occurrence overrides" on public.adhdice_task_occurrence_effective_overrides;
create policy "Users can read canonical occurrence overrides"
  on public.adhdice_task_occurrence_effective_overrides
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical History facts" on public.adhdice_task_history_facts;
create policy "Users can read canonical History facts"
  on public.adhdice_task_history_facts
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical Calendar overrides" on public.adhdice_task_calendar_overrides;
create policy "Users can read canonical Calendar overrides"
  on public.adhdice_task_calendar_overrides
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical reward entitlements" on public.adhdice_task_reward_entitlements;
create policy "Users can read canonical reward entitlements"
  on public.adhdice_task_reward_entitlements
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical reward grants" on public.adhdice_task_reward_grants;
create policy "Users can read canonical reward grants"
  on public.adhdice_task_reward_grants
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read canonical reward claim consumptions" on public.adhdice_task_reward_claim_consumptions;
create policy "Users can read canonical reward claim consumptions"
  on public.adhdice_task_reward_claim_consumptions
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.adhdice_task_state_schema_contract from public, anon, authenticated;
revoke all on table public.adhdice_task_command_operations from public, anon, authenticated;
revoke all on table public.adhdice_task_schedule_boundaries from public, anon, authenticated;
revoke all on table public.adhdice_task_occurrences from public, anon, authenticated;
revoke all on table public.adhdice_task_occurrence_effective_overrides from public, anon, authenticated;
revoke all on table public.adhdice_task_history_facts from public, anon, authenticated;
revoke all on table public.adhdice_task_calendar_overrides from public, anon, authenticated;
revoke all on table public.adhdice_task_reward_entitlements from public, anon, authenticated;
revoke all on table public.adhdice_task_reward_grants from public, anon, authenticated;
revoke all on table public.adhdice_task_reward_claim_consumptions from public, anon, authenticated;

grant select on table public.adhdice_task_command_operations to authenticated;
grant select on table public.adhdice_task_schedule_boundaries to authenticated;
grant select on table public.adhdice_task_occurrences to authenticated;
grant select on table public.adhdice_task_occurrence_effective_overrides to authenticated;
grant select on table public.adhdice_task_history_facts to authenticated;
grant select on table public.adhdice_task_calendar_overrides to authenticated;
grant select on table public.adhdice_task_reward_entitlements to authenticated;
grant select on table public.adhdice_task_reward_grants to authenticated;
grant select on table public.adhdice_task_reward_claim_consumptions to authenticated;

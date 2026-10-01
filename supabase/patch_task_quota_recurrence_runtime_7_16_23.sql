-- ADHDice 7.16.23 quota recurrence runtime/deployment correction.
--
-- Apply only after patch_task_quota_recurrence_7_16_22.sql. This source-only
-- package installs the ledger constraints, quota-aware Task State command RPC,
-- canonical creation RPC, and projection source-fence correction together.
-- It has not been applied to any environment.

begin;

alter table public.adhdice_task_quota_period_facts
  add column if not exists period_kind text,
  add column if not exists period_key text,
  add column if not exists period_start date,
  add column if not exists period_end date,
  add column if not exists base_quota integer,
  add column if not exists incoming_balance integer,
  add column if not exists successful_days integer,
  add column if not exists next_balance integer,
  add column if not exists balance_enabled boolean,
  add column if not exists event_kind text,
  add column if not exists command_id uuid,
  add column if not exists idempotence_identity text,
  add column if not exists source text,
  add column if not exists schedule_boundary_id uuid,
  add column if not exists revision bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table public.adhdice_task_quota_period_facts
  alter column schedule_boundary_id set not null;

do $ddl$
begin
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_quota_period_facts_period_check') then
    alter table public.adhdice_task_quota_period_facts
      add constraint adhdice_task_quota_period_facts_period_check check (period_start <= period_end);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_quota_period_facts_period_key') then
    alter table public.adhdice_task_quota_period_facts
      add constraint adhdice_task_quota_period_facts_period_key check (
        (period_kind = 'week' and period_key = to_char(period_start, 'YYYY-MM-DD'))
        or (period_kind = 'month' and period_key = to_char(period_start, 'YYYY-MM'))
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_quota_period_facts_balance_check') then
    alter table public.adhdice_task_quota_period_facts
      add constraint adhdice_task_quota_period_facts_balance_check check (
        balance_enabled or (incoming_balance = 0 and next_balance = 0)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_quota_period_facts_clear_check') then
    alter table public.adhdice_task_quota_period_facts
      add constraint adhdice_task_quota_period_facts_clear_check check (
        event_kind <> 'clear_balance' or next_balance = 0
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_quota_period_facts_entity_fkey') then
    alter table public.adhdice_task_quota_period_facts
      add constraint adhdice_task_quota_period_facts_entity_fkey
      foreign key (user_id, entity_id)
      references public.adhdice_clean_tasks (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_quota_period_facts_boundary_fkey') then
    alter table public.adhdice_task_quota_period_facts
      add constraint adhdice_task_quota_period_facts_boundary_fkey
      foreign key (user_id, schedule_boundary_id)
      references public.adhdice_task_schedule_boundaries (user_id, id)
      on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'adhdice_task_quota_period_facts_command_fkey') then
    alter table public.adhdice_task_quota_period_facts
      add constraint adhdice_task_quota_period_facts_command_fkey
      foreign key (user_id, command_id)
      references public.adhdice_task_command_operations (user_id, command_id)
      on delete restrict;
  end if;
end;
$ddl$;

create unique index if not exists adhdice_task_quota_period_facts_period_close_key
  on public.adhdice_task_quota_period_facts (
    user_id, entity_id, period_kind, period_key, schedule_boundary_id
  ) where event_kind = 'period_close';
create index if not exists adhdice_task_quota_period_facts_entity_period_idx
  on public.adhdice_task_quota_period_facts (user_id, entity_id, period_start, created_at, id);
create index if not exists adhdice_task_quota_period_facts_boundary_period_idx
  on public.adhdice_task_quota_period_facts (user_id, schedule_boundary_id, period_start, created_at, id);

alter table public.adhdice_task_quota_period_facts enable row level security;
drop policy if exists "Users can read canonical quota period facts" on public.adhdice_task_quota_period_facts;
create policy "Users can read canonical quota period facts"
  on public.adhdice_task_quota_period_facts
  for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.adhdice_task_quota_period_facts from public, anon, authenticated;
grant select on table public.adhdice_task_quota_period_facts to authenticated;

-- M3A: canonical Task State command persistence foundation.
--
-- Authored for separate review and deployment.  This file is intentionally
-- not executed by M3A.  The trusted Edge Function calls this backend-only
-- transaction.  The TypeScript command planner owns business-state
-- planning; this RPC owns the transaction, ownership, revision, idempotence,
-- canonical writes, compatibility projection, and reward-entitlement fence.
-- One function invocation is one database transaction.  No external calls or
-- legacy reward claims occur while the task row is locked.

create or replace function public.adhdice_execute_task_state_command(
  p_user_id uuid,
  p_command jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_command_id uuid;
  v_entity_id uuid;
  v_entity_kind text;
  v_command_type text;
  v_idempotence_identity text;
  v_accepted_payload_digest text;
  v_source_kind text;
  v_logical_day_context jsonb;
  v_payload jsonb;
  v_task_patch jsonb;
  v_projection jsonb;
  v_history jsonb;
  v_automatic_history_facts jsonb;
  v_automatic_history_delete_ids jsonb;
  v_automatic_history jsonb;
  v_occurrence jsonb;
  v_schedule jsonb;
  v_effective_override jsonb;
  v_calendar_override jsonb;
  v_quota_period_facts jsonb;
  v_quota_fact jsonb;
  v_expected_entity_revision bigint;
  v_expected_boundary_sequence bigint;
  v_current_boundary_sequence bigint;
  v_task public.adhdice_clean_tasks%rowtype;
  v_operation public.adhdice_task_command_operations%rowtype;
  v_history_row public.adhdice_task_history_facts%rowtype;
  v_occurrence_row public.adhdice_task_occurrences%rowtype;
  v_schedule_id uuid;
  v_occurrence_id uuid;
  v_prior_history_occurrence_id uuid;
  v_history_id uuid;
  v_automatic_history_ids jsonb := '[]'::jsonb;
  v_effective_override_id uuid;
  v_calendar_override_id uuid;
  v_reward_entitlement_id uuid;
  v_next_revision bigint;
  v_projection_status text;
  v_projection_due_on date;
  v_profile_timezone text;
  v_profile_day_start_time text;
  v_profile_settings_revision bigint;
  v_result jsonb;
  v_reward_program_version text;
  v_reward_event_identity text;
  v_reward_streak integer := 0;
  v_reward_units_snapshot integer;
  v_reward_streak_fact record;
  v_achievement_evaluation jsonb;
  v_achievement_operation_id uuid;
  v_operation_is_new boolean := false;
  v_achievement_deferred_user_id text;
  v_achievement_deferred_for_command boolean := false;
begin
  v_achievement_deferred_user_id := current_setting('adhdice.achievement_deferred_user_id', true);
  v_achievement_deferred_for_command := coalesce(v_achievement_deferred_user_id = p_user_id::text, false);

  -- Only the trusted Edge Function's secret-key backend role may invoke this
  -- invoker function.  User ownership is established by the Edge Function
  -- from verified Auth claims, not by a browser-supplied body field.
  if current_user <> 'service_role' then
    raise exception 'Task State command RPC is backend-only.'
      using errcode = '42501';
  end if;

  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception 'Task State command must be a JSON object.'
      using errcode = '22023';
  end if;

  v_command_id := nullif(p_command->>'command_id', '')::uuid;
  v_entity_id := nullif(p_command->>'entity_id', '')::uuid;
  v_entity_kind := nullif(p_command->>'entity_kind', '');
  v_command_type := nullif(p_command->>'command_type', '');
  v_idempotence_identity := nullif(p_command->>'idempotence_identity', '');
  v_accepted_payload_digest := nullif(p_command->>'accepted_payload_digest', '');
  v_source_kind := coalesce(nullif(p_command->>'source_kind', ''), 'runtime');
  v_logical_day_context := coalesce(p_command->'logical_day_context', '{}'::jsonb);
  v_payload := coalesce(p_command->'payload', '{}'::jsonb);
  v_task_patch := coalesce(v_payload->'task_patch', '{}'::jsonb);
  v_projection := coalesce(v_payload->'compatibility_projection', '{}'::jsonb);
  v_history := coalesce(v_payload->'history_fact', '{}'::jsonb);
  v_automatic_history_facts := coalesce(v_payload->'automatic_history_facts', '[]'::jsonb);
  v_automatic_history_delete_ids := coalesce(v_payload->'automatic_history_delete_ids', '[]'::jsonb);
  v_occurrence := coalesce(v_payload->'occurrence', '{}'::jsonb);
  v_schedule := coalesce(v_payload->'schedule_boundary', '{}'::jsonb);
  v_effective_override := coalesce(v_payload->'occurrence_effective_override', '{}'::jsonb);
  v_calendar_override := coalesce(v_payload->'calendar_override', '{}'::jsonb);
  v_quota_period_facts := coalesce(v_payload->'quota_period_facts', '[]'::jsonb);
  v_expected_entity_revision := nullif(p_command->>'expected_entity_revision', '')::bigint;
  v_expected_boundary_sequence := nullif(p_command->>'expected_boundary_sequence', '')::bigint;

  if v_source_kind <> 'runtime'
     and not (v_command_type = 'reconcile_rollover' and v_source_kind = 'authorized_automation') then
    raise exception 'The runtime RPC accepts source_kind=runtime, except for the trusted automatic rollover provenance.'
      using errcode = '42501';
  end if;

  if v_command_id is null
     or v_entity_id is null
     or v_entity_kind not in ('parent', 'step', 'substep')
     or v_command_type not in (
       'set_outcome', 'clear_outcome', 'complete_task', 'delay_occurrence',
       'set_due_date', 'set_repeat', 'calendar_override', 'archive_task',
       'trash_task', 'restore_task', 'start_in_progress', 'clear_in_progress',
       'reconcile_rollover', 'clear_quota_balance', 'hierarchy_change'
     )
     or v_idempotence_identity is null
     or v_accepted_payload_digest is null
     or v_accepted_payload_digest !~ '^sha256-[0-9a-f]{64}$'
     or v_expected_entity_revision is null
     or v_expected_entity_revision < 1 then
    raise exception 'Task State command envelope is incomplete or invalid.'
      using errcode = '22023';
  end if;

  -- The Edge Function is the only caller allowed to build this payload.  Keep
  -- the SQL checks structural: they reject impossible planner output without
  -- reimplementing recurrence or Task State semantics.
  if jsonb_typeof(v_payload) <> 'object'
     or jsonb_typeof(v_logical_day_context) <> 'object'
     or jsonb_typeof(v_task_patch) <> 'object'
     or jsonb_typeof(v_projection) <> 'object'
     or jsonb_typeof(v_history) <> 'object'
     or jsonb_typeof(v_automatic_history_facts) <> 'array'
     or jsonb_typeof(v_automatic_history_delete_ids) <> 'array'
     or jsonb_typeof(v_occurrence) <> 'object'
     or jsonb_typeof(v_schedule) <> 'object'
     or jsonb_typeof(v_effective_override) <> 'object'
     or jsonb_typeof(v_calendar_override) <> 'object'
     or jsonb_typeof(v_quota_period_facts) <> 'array' then
    raise exception 'Task State command payload sections must be JSON objects.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_payload) as payload_key(key)
    where key not in (
      'task_patch', 'compatibility_projection', 'history_fact', 'automatic_history_facts',
      'automatic_history_delete_ids', 'occurrence',
      'schedule_boundary', 'occurrence_effective_override', 'calendar_override',
      'reward_program_version', 'reward_eligible', 'quota_period_facts', 'occurrence_key', 'clear_logical_date', 'manual_action'
    )
  ) then
    raise exception 'Task State command payload contains an unknown section.'
      using errcode = '22023';
  end if;

  if v_payload ? 'reward_eligible'
     and v_payload->>'reward_eligible' <> 'true' then
    raise exception 'Reward eligibility is a positive server planner decision; false is not an entitlement request.'
      using errcode = '22023';
  end if;
  if v_payload->>'reward_eligible' = 'true'
     and nullif(v_payload->>'reward_program_version', '') is null then
    raise exception 'Reward eligibility requires an explicit reward program version.'
      using errcode = '22023';
  end if;
  if v_command_type not in ('reconcile_rollover', 'clear_quota_balance')
     and v_quota_period_facts <> '[]'::jsonb then
    raise exception 'Only rollover and Clear Balance commands may persist quota period facts.'
      using errcode = '42501';
  end if;

  -- Runtime provenance is server-owned.  Reject a spoof before any replay
  -- operation is claimed, then overwrite the accepted values again below.
  if coalesce(nullif(v_history->>'provenance_kind', ''), (case when v_command_type = 'reconcile_rollover' then 'authorized_automation' else 'user' end))
       <> (case when v_command_type = 'reconcile_rollover' then 'authorized_automation' else 'user' end)
     or coalesce(nullif(v_occurrence->>'provenance_kind', ''), 'user') <> 'user'
     or coalesce(nullif(v_effective_override->>'provenance_kind', ''), 'user') <> 'user'
     or coalesce(nullif(v_calendar_override->>'provenance_kind', ''), 'manual') <> 'manual'
     or nullif(v_schedule->>'actor_kind', '') is not null and v_schedule->>'actor_kind' <> 'user'
     or nullif(v_occurrence->>'actor_kind', '') is not null and v_occurrence->>'actor_kind' <> 'user'
     or nullif(v_effective_override->>'actor_kind', '') is not null and v_effective_override->>'actor_kind' <> 'user'
     or nullif(v_history->>'actor_kind', '') is not null
        and v_history->>'actor_kind' <> (case when v_command_type = 'reconcile_rollover' then 'authorized_automation' else 'user' end)
     or nullif(v_calendar_override->>'actor_kind', '') is not null and v_calendar_override->>'actor_kind' <> 'user'
     or nullif(v_history->>'source_legacy_history_id', '') is not null
     or nullif(v_schedule->>'source', '') is not null and v_schedule->>'source' <> 'task_state_command'
     or nullif(v_occurrence->>'source', '') is not null and v_occurrence->>'source' <> 'task_state_command'
     or nullif(v_effective_override->>'source', '') is not null and v_effective_override->>'source' <> 'task_state_command'
     or nullif(v_history->>'source', '') is not null and v_history->>'source' <> 'task_state_command'
     or nullif(v_calendar_override->>'source', '') is not null and v_calendar_override->>'source' <> 'task_state_command' then
    raise exception 'Runtime Task State provenance is server-owned.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(v_automatic_history_facts) as automatic_fact(value)
     where jsonb_typeof(value) <> 'object'
        or value->>'provenance_kind' <> 'authorized_automation'
        or value->>'actor_kind' <> 'authorized_automation'
        or nullif(value->>'actor_id', '') is not null
        or nullif(value->>'source_legacy_history_id', '') is not null
        or value->>'source' <> 'task_state_command'
  ) then
    raise exception 'Automatic History provenance is server-owned.'
      using errcode = '42501';
  end if;

  if v_command_type not in ('reconcile_rollover', 'set_due_date', 'set_repeat')
     and v_automatic_history_facts <> '[]'::jsonb then
    raise exception 'Only trusted schedule replay or rollover may create automatic History facts.'
      using errcode = '42501';
  end if;
  if v_command_type <> 'set_outcome' and v_automatic_history_delete_ids <> '[]'::jsonb then
    raise exception 'Only a manual outcome correction may reconcile dependent automatic History.'
      using errcode = '42501';
  end if;

  if v_command_type = 'hierarchy_change' then
    raise exception 'This Task State command type has no trusted planner boundary.'
      using errcode = '0A000';
  end if;

  if v_command_type in ('archive_task', 'trash_task', 'restore_task') then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Lifecycle commands cannot carry History, schedule, occurrence, delay, Calendar, or reward mutations.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'terminal_state', 'container_state', 'prior_container_state',
                        'prior_container_state_status', 'container_trashed_at')
    ) then
      raise exception 'Lifecycle command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'set_outcome' then
    if v_history = '{}'::jsonb or v_schedule <> '{}'::jsonb or v_effective_override <> '{}'::jsonb
       or v_calendar_override <> '{}'::jsonb or (v_payload ? 'reward_program_version' and v_history->>'outcome' = 'missed') then
      raise exception 'Outcome command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if v_history->>'outcome' not in ('done', 'did_my_best', 'missed')
       or v_history->>'event_kind' <> 'explicit_outcome' then
      raise exception 'Outcome command must carry one explicit outcome History fact.'
        using errcode = '22023';
    end if;
    if v_automatic_history_delete_ids <> '[]'::jsonb
       and (v_history->>'outcome' not in ('done', 'did_my_best')
            or nullif(v_history->>'scheduled_due_on', '') is null) then
      raise exception 'Dependent automatic History reconciliation requires a successful occurrence correction.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',
                        'workflow_logical_date', 'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Outcome command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'complete_task' then
    if v_history = '{}'::jsonb or v_history->>'outcome' <> 'complete'
       or v_history->>'event_kind' <> 'terminal_complete'
       or v_schedule <> '{}'::jsonb or v_effective_override <> '{}'::jsonb
       or v_calendar_override <> '{}'::jsonb
       or v_payload->>'reward_eligible' <> 'true'
       or (v_payload ? 'reward_program_version') = false then
      raise exception 'Complete command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'terminal_state', 'terminal_completed_at', 'container_state',
                        'workflow_state', 'workflow_started_at', 'workflow_logical_date',
                        'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Complete command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'delay_occurrence' then
    if v_history = '{}'::jsonb or v_history->>'outcome' <> 'delayed'
       or v_history->>'event_kind' <> 'delay_audit'
       or v_effective_override = '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_occurrence = '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Delay command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Delay command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type in ('set_due_date', 'set_repeat') then
    if v_schedule = '{}'::jsonb or v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Schedule command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Schedule command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'calendar_override' then
    if v_calendar_override = '{}'::jsonb or v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb
       or v_schedule <> '{}'::jsonb or v_effective_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Calendar override command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Calendar command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'clear_outcome' then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'
       or v_payload ? 'reward_program_version'
       or not (v_payload ? 'clear_logical_date')
       or nullif(v_payload->>'clear_logical_date', '') is null then
      raise exception 'Clear outcome command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Clear outcome command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'clear_quota_balance' then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version'
       or coalesce(v_payload->>'clear_quota_balance', 'false') <> 'true' then
      raise exception 'Clear quota balance command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status')
    ) then
      raise exception 'Clear quota balance command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type in ('start_in_progress', 'clear_in_progress') then
    if v_history <> '{}'::jsonb or v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb
       or v_payload ? 'reward_program_version' then
      raise exception 'Workflow command payload sections are incompatible.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',
                        'workflow_logical_date', 'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Workflow command carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
    if v_command_type = 'start_in_progress'
       and (v_task_patch->>'workflow_state' <> 'in_progress'
            or nullif(v_task_patch->>'workflow_started_at', '') is null
            or nullif(v_task_patch->>'workflow_logical_date', '') is null) then
      raise exception 'start_in_progress requires a compatible workflow patch.'
        using errcode = '22023';
    end if;
    if v_command_type = 'clear_in_progress'
       and (v_task_patch->>'workflow_state' <> 'none'
            or nullif(v_task_patch->>'workflow_started_at', '') is not null
            or nullif(v_task_patch->>'workflow_logical_date', '') is not null
            or nullif(v_task_patch->>'workflow_occurrence_id', '') is not null) then
      raise exception 'clear_in_progress requires a compatible workflow patch.'
        using errcode = '22023';
    end if;
  elsif v_command_type = 'reconcile_rollover' then
    if v_occurrence <> '{}'::jsonb or v_schedule <> '{}'::jsonb
       or v_effective_override <> '{}'::jsonb or v_calendar_override <> '{}'::jsonb then
      raise exception 'Rollover cannot carry schedule, occurrence, delay, or Calendar mutations.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
      where key not in ('canonicalization_status', 'workflow_state', 'workflow_started_at',
                        'workflow_logical_date', 'workflow_occurrence_id', 'workflow_command_id', 'workflow_revision')
    ) then
      raise exception 'Rollover carries an unrelated canonical Task patch.'
        using errcode = '22023';
    end if;
    if (v_payload->>'synthetic_did_my_best')::boolean is true then
      raise exception 'Rollover cannot carry a client synthetic Did My Best marker.'
        using errcode = '22023';
    end if;
    if v_history <> '{}'::jsonb and v_automatic_history_facts <> '[]'::jsonb then
      raise exception 'One rollover cannot mix stale-workflow completion with automatic Missed recovery.'
        using errcode = '22023';
    end if;
  end if;

  -- Serialize the two replay identities before the read/claim sequence.  The
  -- advisory locks are transaction-scoped and namespaced so equivalent first
  -- calls cannot both observe an absent operation and race the unique keys.
  -- The unique constraints remain the durable fence; ON CONFLICT plus the
  -- re-read below also handles a competing writer outside this function.
  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':task-state-idempotence:' || v_idempotence_identity,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':task-state-command:' || v_command_id::text,
    0
  ));

  -- Lock command identity before the entity.  Duplicate command ID and
  -- idempotence identity are both replay keys; a committed result is returned
  -- without reapplying any canonical write.
  select * into v_operation
    from public.adhdice_task_command_operations
   where user_id = p_user_id
     and idempotence_identity = v_idempotence_identity
   for update;
  if not found then
    select * into v_operation
      from public.adhdice_task_command_operations
     where user_id = p_user_id
       and command_id = v_command_id
     for update;
  end if;

  if not found then
    insert into public.adhdice_task_command_operations (
    user_id,
    entity_id,
    entity_kind,
    command_id,
    command_type,
    idempotence_identity,
    accepted_payload_digest,
    logical_day_context_identity,
    requested_logical_date,
    requested_occurrence_key,
    expected_entity_revision,
    expected_boundary_sequence,
    state,
    result_references,
    source_kind,
    schema_contract_version
  ) values (
    p_user_id,
    v_entity_id,
    v_entity_kind,
    v_command_id,
    v_command_type,
    v_idempotence_identity,
    v_accepted_payload_digest,
    nullif(v_logical_day_context->>'identity', ''),
    nullif(v_logical_day_context->>'logical_date', '')::date,
    nullif(v_payload->>'occurrence_key', ''),
    v_expected_entity_revision,
    v_expected_boundary_sequence,
    'accepted',
    '{}'::jsonb,
    v_source_kind,
    'task-state-schema-v1'
    )
    on conflict do nothing
    returning * into v_operation;

    if found then
      v_operation_is_new := true;
    else
      -- A concurrent or separately authorized writer claimed a replay key.
      -- Re-read it under row lock so equivalent requests replay while a
      -- mismatched payload receives the explicit identity-reuse error below.
      select * into v_operation
        from public.adhdice_task_command_operations
       where user_id = p_user_id
         and (idempotence_identity = v_idempotence_identity or command_id = v_command_id)
       order by case when idempotence_identity = v_idempotence_identity then 0 else 1 end
       limit 1
       for update;
      if not found then
        raise exception 'Task State command could not claim its replay identity.'
          using errcode = '40001';
      end if;
    end if;
  end if;

  if not v_operation_is_new then
    if v_operation.command_id is distinct from v_command_id
       or v_operation.idempotence_identity is distinct from v_idempotence_identity
       or v_operation.accepted_payload_digest is distinct from v_accepted_payload_digest then
      raise exception 'Command identity was reused with a different payload.'
        using errcode = '40001';
    end if;
    if v_operation.state in ('committed', 'rejected') then
      return v_operation.result_references || jsonb_build_object('was_replayed', true);
    end if;
    raise exception 'The command is already being processed.'
      using errcode = '40001';
  end if;

  -- The canonical Task row is the sole entity lock.  Compatibility status and
  -- due_on are applied only after this canonical revision check and never
  -- participate in deciding the canonical transition.
  select * into v_task
    from public.adhdice_clean_tasks
   where user_id = p_user_id
     and id = v_entity_id
   for update;
  if not found then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'TASK_NOT_FOUND',
      'expected_revision', v_expected_entity_revision,
      'next_revision', null
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'TASK_NOT_FOUND',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  if v_task.canonicalization_status not in ('canonical_proven', 'canonical_runtime')
     or v_task.canonical_revision is null then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'CANONICAL_STATE_UNAVAILABLE',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'CANONICAL_STATE_UNAVAILABLE',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  select timezone, day_start_time::text, settings_revision
    into v_profile_timezone, v_profile_day_start_time, v_profile_settings_revision
    from public.adhdice_user_profiles
   where user_id = p_user_id;
  if not found or v_profile_timezone is null or v_profile_day_start_time is null
     or v_profile_settings_revision is null or v_profile_settings_revision < 1 then
    raise exception 'Canonical logical-day profile is unavailable.'
      using errcode = '55000';
  end if;
  v_logical_day_context := jsonb_set(v_logical_day_context, '{timezone}', to_jsonb(v_profile_timezone), true);
  v_logical_day_context := jsonb_set(v_logical_day_context, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
  v_logical_day_context := jsonb_set(v_logical_day_context, '{settings_revision}', to_jsonb(v_profile_settings_revision), true);

  if v_task.entity_kind is distinct from v_entity_kind then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'ENTITY_KIND_MISMATCH',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'ENTITY_KIND_MISMATCH',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  if v_task.canonical_revision is distinct from v_expected_entity_revision then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'STALE_REVISION',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'STALE_REVISION',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  -- canonical_revision is the entity-wide fence.  History and occurrence
  -- collection revision aggregates are intentionally not runtime fences:
  -- inserting a new revision-1 row does not create a monotonic generation.
  -- boundary_sequence remains valid because schedule boundaries are append-only.
  select coalesce(max(boundary_sequence), 0)
    into v_current_boundary_sequence
    from public.adhdice_task_schedule_boundaries
   where user_id = p_user_id and entity_id = v_entity_id;

  if v_expected_boundary_sequence is not null
     and v_expected_boundary_sequence is distinct from v_current_boundary_sequence then
    v_result := jsonb_build_object(
      'command_id', v_command_id,
      'state', 'rejected',
      'conflict_code', 'STALE_BOUNDARY_SEQUENCE',
      'expected_revision', v_expected_entity_revision,
      'next_revision', v_task.canonical_revision
    );
    update public.adhdice_task_command_operations
       set state = 'rejected',
           conflict_code = 'STALE_BOUNDARY_SEQUENCE',
           result_digest = md5(v_result::text),
           result_references = v_result,
           completed_at = now()
     where user_id = p_user_id and command_id = v_command_id;
    return v_result || jsonb_build_object('was_replayed', false);
  end if;

  -- Automatic rollover is a narrow trusted History writer. The server-derived
  -- payload may either finalize one stale In Progress workflow as Did My Best,
  -- or materialize passed scheduled obligations as automatic Missed. It cannot
  -- mix those operations or materialize the current open logical day.
  if v_command_type = 'reconcile_rollover' then
    if v_logical_day_context->>'logical_date' is distinct from public.adhdice_effective_logical_date(
      clock_timestamp(), v_profile_timezone, v_profile_day_start_time
    )::text then
      raise exception 'Rollover logical-day context is not current.'
        using errcode = '40001';
    end if;
    if v_history = '{}'::jsonb and v_automatic_history_facts = '[]'::jsonb then
      if v_payload ? 'reward_program_version' then
        raise exception 'Rollover cannot carry reward data without its automatic Did My Best History fact.'
          using errcode = '22023';
      end if;
      if v_task.workflow_state = 'in_progress' then
        if v_task.workflow_logical_date is null
           or v_task.workflow_logical_date >= public.adhdice_effective_logical_date(clock_timestamp(), v_profile_timezone, v_profile_day_start_time)
           or v_task_patch->>'workflow_state' <> 'none'
           or nullif(v_task_patch->>'workflow_logical_date', '') is not null
           or nullif(v_task_patch->>'workflow_occurrence_id', '') is not null
           or nullif(v_task_patch->>'workflow_command_id', '') is not null
           or (v_task_patch->>'workflow_revision')::bigint is distinct from coalesce(v_task.workflow_revision, 1) + 1 then
          raise exception 'Rollover may clear only a stale canonical In Progress workflow.'
            using errcode = '22023';
        end if;
      elsif exists (
        select 1 from jsonb_object_keys(v_task_patch) as patch_key(key)
        where key <> 'canonicalization_status'
      ) then
        raise exception 'A no-op rollover cannot carry a Task State mutation.'
          using errcode = '22023';
      end if;
    elsif v_history <> '{}'::jsonb then
      if v_source_kind <> 'authorized_automation'
         or v_history->>'outcome' <> 'did_my_best'
         or v_history->>'event_kind' <> 'authorized_automation'
         or v_history->>'logical_date' is null
         or v_task.workflow_state <> 'in_progress'
         or v_task.workflow_logical_date is null
         or (v_history->>'logical_date')::date is distinct from v_task.workflow_logical_date
         or v_task.workflow_logical_date >= public.adhdice_effective_logical_date(clock_timestamp(), v_profile_timezone, v_profile_day_start_time)
         or v_payload->>'reward_program_version' <> 'task-reward-v1'
         or v_projection->>'status' = 'in_progress'
         or nullif(v_projection->>'active_status_logical_date', '') is not null
         or nullif(v_projection->>'active_occurrence_due_on', '') is not null
         or v_task_patch->>'workflow_state' <> 'none'
         or nullif(v_task_patch->>'workflow_logical_date', '') is not null
         or nullif(v_task_patch->>'workflow_occurrence_id', '') is not null
         or nullif(v_task_patch->>'workflow_command_id', '') is not null
         or (v_task_patch->>'workflow_revision')::bigint is distinct from coalesce(v_task.workflow_revision, 1) + 1 then
        raise exception 'Automatic rollover must finalize only the stale workflow as Did My Best and clear it.'
          using errcode = '22023';
      end if;
      if nullif(v_history->>'occurrence_id', '')::uuid is distinct from v_task.workflow_occurrence_id then
        raise exception 'Automatic rollover History must use the stale workflow occurrence identity.'
          using errcode = '22023';
      end if;
      if v_task.workflow_occurrence_id is null
         and nullif(v_history->>'scheduled_due_on', '') is not null then
        raise exception 'Automatic rollover without a workflow occurrence cannot carry a scheduled due date.'
          using errcode = '22023';
      end if;
      if v_task.workflow_occurrence_id is not null and not exists (
        select 1 from public.adhdice_task_occurrences occurrence
         where occurrence.user_id = p_user_id
           and occurrence.entity_id = v_entity_id
           and occurrence.id = v_task.workflow_occurrence_id
           and occurrence.scheduled_due_on = nullif(v_history->>'scheduled_due_on', '')::date
      ) then
        raise exception 'Automatic rollover History occurrence evidence is not owned by the Task.'
          using errcode = '23503';
      end if;
    else
      if v_source_kind <> 'authorized_automation'
         or v_payload ? 'reward_program_version'
         or v_task.workflow_state = 'in_progress'
         or jsonb_array_length(v_automatic_history_facts) = 0 then
        raise exception 'Automatic Missed recovery requires a non-workflow authorized rollover without reward data.'
          using errcode = '22023';
      end if;
      if exists (
        select 1
          from jsonb_array_elements(v_automatic_history_facts) as automatic_fact(value)
         where value->>'outcome' <> 'missed'
            or value->>'event_kind' <> 'authorized_automation'
            or nullif(value->>'logical_date', '') is null
            or (value->>'logical_date')::date >= public.adhdice_effective_logical_date(clock_timestamp(), v_profile_timezone, v_profile_day_start_time)
            or nullif(value->>'scheduled_due_on', '') is null
            or (value->>'scheduled_due_on')::date > (value->>'logical_date')::date
            or nullif(value->>'occurrence_id', '') is not null
            or nullif(value->>'effective_due_on', '') is not null
            or nullif(value->>'schedule_boundary_id', '') is null
            or not exists (
              select 1
                from public.adhdice_task_schedule_boundaries boundary
               where boundary.user_id = p_user_id
                 and boundary.entity_id = v_entity_id
                 and boundary.id = (value->>'schedule_boundary_id')::uuid
                 and boundary.boundary_sequence = v_current_boundary_sequence
                 and boundary.schedule_model <> 'unscheduled'
            )
      ) then
        raise exception 'Automatic Missed facts require past, owned, currently scheduled boundary evidence.'
          using errcode = '23503';
      end if;
    end if;
  end if;

  if v_automatic_history_delete_ids <> '[]'::jsonb then
    if exists (
      select 1
        from jsonb_array_elements_text(v_automatic_history_delete_ids) as requested(id)
        left join public.adhdice_task_history_facts fact
          on fact.user_id = p_user_id
         and fact.entity_id = v_entity_id
         and fact.id = requested.id::uuid
       where fact.id is null
          or fact.provenance_kind <> 'authorized_automation'
          or fact.actor_kind <> 'authorized_automation'
          or fact.outcome <> 'missed'
          or fact.logical_date <= (v_history->>'logical_date')::date
          or fact.scheduled_due_on is distinct from nullif(v_history->>'scheduled_due_on', '')::date
          or exists (
            select 1 from public.adhdice_task_reward_entitlements entitlement
             where entitlement.user_id = fact.user_id
               and entitlement.canonical_history_id = fact.id
          )
    ) or not exists (
      select 1
        from public.adhdice_task_schedule_boundaries boundary
       where boundary.user_id = p_user_id
         and boundary.entity_id = v_entity_id
         and boundary.boundary_sequence = v_current_boundary_sequence
         and boundary.schedule_model = 'rolling'
         and boundary.repeat_interval > 1
    ) then
      raise exception 'Dependent automatic History deletion is not proven safe.'
        using errcode = '55000';
    end if;
  end if;

  if v_projection->>'status' is null
     or v_projection->>'due_on' is null and not (v_projection ? 'due_on')
     or v_projection->>'status' = 'unscheduled' then
    raise exception 'Canonical commands require a normalized persisted compatibility projection.'
      using errcode = '22023';
  end if;
  v_projection_status := v_projection->>'status';
  v_projection_due_on := nullif(v_projection->>'due_on', '')::date;
  if v_projection_status not in (
    'pending', 'done', 'missed', 'did_my_best', 'upcoming', 'not_due',
    'delayed', 'archived', 'trashed', 'complete', 'in_progress'
  ) then
    raise exception 'Compatibility status is not a supported persisted projection.'
      using errcode = '22023';
  end if;
  if v_projection_status = 'in_progress' and v_command_type <> 'start_in_progress' then
    raise exception 'Only start_in_progress may persist an in_progress compatibility projection.'
      using errcode = '22023';
  end if;
  if v_command_type = 'start_in_progress' and v_projection_status <> 'in_progress' then
    raise exception 'start_in_progress requires an in_progress compatibility projection.'
      using errcode = '22023';
  end if;

  v_next_revision := v_task.canonical_revision + 1;

  if v_command_type = 'start_in_progress' then
    v_task_patch := jsonb_set(v_task_patch, '{workflow_command_id}', to_jsonb(v_command_id), true);
    v_task_patch := jsonb_set(v_task_patch, '{workflow_started_at}', to_jsonb(now()), true);
    v_task_patch := jsonb_set(v_task_patch, '{workflow_logical_date}', to_jsonb(nullif(v_logical_day_context->>'logical_date', '')::date), true);
  elsif v_command_type in ('set_outcome', 'complete_task', 'clear_in_progress') then
    v_task_patch := jsonb_set(v_task_patch, '{workflow_command_id}', 'null'::jsonb, true);
  end if;
  if v_command_type in ('set_outcome', 'complete_task', 'start_in_progress', 'clear_in_progress') then
    v_task_patch := jsonb_set(v_task_patch, '{workflow_revision}', to_jsonb(coalesce(v_task.workflow_revision, 0) + 1), true);
  end if;

  update public.adhdice_clean_tasks
     set canonicalization_status = case
       when v_task.canonicalization_status = 'canonical_proven' then 'canonical_runtime'
       else v_task.canonicalization_status
     end,
         terminal_state = case when v_task_patch ? 'terminal_state' then v_task_patch->>'terminal_state' else terminal_state end,
         container_state = case when v_task_patch ? 'container_state' then v_task_patch->>'container_state' else container_state end,
         prior_container_state = case when v_task_patch ? 'prior_container_state' then nullif(v_task_patch->>'prior_container_state', '') else prior_container_state end,
         prior_container_state_status = case when v_task_patch ? 'prior_container_state_status' then v_task_patch->>'prior_container_state_status' else prior_container_state_status end,
         terminal_completed_at = case when v_task_patch ? 'terminal_completed_at' then nullif(v_task_patch->>'terminal_completed_at', '')::timestamptz else terminal_completed_at end,
         container_trashed_at = case when v_task_patch ? 'container_trashed_at' then nullif(v_task_patch->>'container_trashed_at', '')::timestamptz else container_trashed_at end,
         workflow_state = case when v_task_patch ? 'workflow_state' then v_task_patch->>'workflow_state' else workflow_state end,
         workflow_started_at = case when v_task_patch ? 'workflow_started_at' then nullif(v_task_patch->>'workflow_started_at', '')::timestamptz else workflow_started_at end,
         workflow_logical_date = case when v_task_patch ? 'workflow_logical_date' then nullif(v_task_patch->>'workflow_logical_date', '')::date else workflow_logical_date end,
         workflow_occurrence_id = case when v_task_patch ? 'workflow_occurrence_id' then nullif(v_task_patch->>'workflow_occurrence_id', '')::uuid else workflow_occurrence_id end,
         workflow_command_id = case when v_task_patch ? 'workflow_command_id' then nullif(v_task_patch->>'workflow_command_id', '')::uuid else workflow_command_id end,
         workflow_revision = case when v_task_patch ? 'workflow_revision' then (v_task_patch->>'workflow_revision')::bigint else workflow_revision end,
         status = v_projection_status::public.adhdice_clean_task_status,
         due_on = v_projection_due_on,
         completed_at = case when v_projection ? 'completed_at' then nullif(v_projection->>'completed_at', '')::timestamptz else completed_at end,
         active_status_logical_date = case when v_projection ? 'active_status_logical_date' then nullif(v_projection->>'active_status_logical_date', '')::date else active_status_logical_date end,
         active_occurrence_due_on = case when v_projection ? 'active_occurrence_due_on' then nullif(v_projection->>'active_occurrence_due_on', '')::date else active_occurrence_due_on end,
         repeat_quota_count = case
           when v_schedule <> '{}'::jsonb and v_schedule->>'repeat_frequency' in ('per_week', 'per_month')
             then nullif(v_schedule->>'repeat_quota_count', '')::integer
           when v_schedule <> '{}'::jsonb then null
           else repeat_quota_count
         end,
         repeat_quota_balance_enabled = case
           when v_schedule <> '{}'::jsonb then coalesce((v_schedule->>'repeat_quota_balance_enabled')::boolean, false)
           else repeat_quota_balance_enabled
         end,
         repeat_quota_balance = case
           when v_projection ? 'repeat_quota_balance' then nullif(v_projection->>'repeat_quota_balance', '')::integer
           when v_command_type = 'clear_quota_balance' then 0
           when v_schedule <> '{}'::jsonb and coalesce(v_schedule->>'repeat_frequency', 'none') not in ('per_week', 'per_month') then null
           when v_schedule <> '{}'::jsonb and coalesce((v_schedule->>'repeat_quota_balance_enabled')::boolean, false) = false then 0
           else repeat_quota_balance
         end,
         repeat_quota_balance_period = case
           when v_projection ? 'repeat_quota_balance_period' then nullif(v_projection->>'repeat_quota_balance_period', '')
           when v_command_type = 'clear_quota_balance' then
           case when repeat_frequency = 'per_week' then date_trunc('week', (v_logical_day_context->>'logical_date')::date)::date::text
                when repeat_frequency = 'per_month' then to_char(date_trunc('month', (v_logical_day_context->>'logical_date')::date)::date, 'YYYY-MM')
                else repeat_quota_balance_period end
           when v_schedule <> '{}'::jsonb and coalesce(v_schedule->>'repeat_frequency', 'none') not in ('per_week', 'per_month') then null
           when v_schedule <> '{}'::jsonb and coalesce((v_schedule->>'repeat_quota_balance_enabled')::boolean, false) = false then null
           else repeat_quota_balance_period end,
         canonical_revision = v_next_revision,
         canonical_updated_at = now(),
         projection_source_canonical_revision = v_next_revision,
         projection_source_fingerprint = v_accepted_payload_digest,
         projection_version = 'task-state-projection-v1',
         revision = revision + 1,
         updated_at = now()
   where user_id = p_user_id and id = v_entity_id;

  if v_command_type = 'clear_quota_balance' then
    if v_task.repeat_frequency not in ('per_week', 'per_month') then
      raise exception 'Clear quota balance requires a quota recurrence.' using errcode = '22023';
    end if;
    if not coalesce(v_task.repeat_quota_balance_enabled, false) then
      raise exception 'Clear quota balance requires balance mode to be enabled.' using errcode = '22023';
    end if;
    if jsonb_array_length(v_quota_period_facts) <> 1
       or (v_quota_period_facts->0)->>'event_kind' <> 'clear_balance' then
      raise exception 'Clear quota balance requires exactly one planned clear_balance fact.' using errcode = '22023';
    end if;
  elsif v_command_type = 'reconcile_rollover'
     and exists (
       select 1 from jsonb_array_elements(v_quota_period_facts) as quota_fact(value)
       where value->>'event_kind' <> 'period_close'
     ) then
    raise exception 'Rollover quota facts must be period_close facts.' using errcode = '22023';
  end if;

  -- Schedule boundaries are append-only canonical schedule authority.  The
  -- planner supplies a complete schema-aligned row; server-owned identity and
  -- owner/command columns are overwritten before the insert.
  if v_schedule <> '{}'::jsonb then
    v_schedule := jsonb_set(v_schedule, '{id}', to_jsonb(coalesce(nullif(v_schedule->>'id', '')::uuid, gen_random_uuid())), true);
    v_schedule := jsonb_set(v_schedule, '{user_id}', to_jsonb(p_user_id), true);
    v_schedule := jsonb_set(v_schedule, '{entity_id}', to_jsonb(v_entity_id), true);
    v_schedule := jsonb_set(v_schedule, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_schedule := jsonb_set(v_schedule, '{actor_kind}', to_jsonb('user'::text), true);
    v_schedule := jsonb_set(v_schedule, '{actor_id}', to_jsonb(p_user_id), true);
    v_schedule := jsonb_set(v_schedule, '{source}', to_jsonb('task_state_command'::text), true);
    v_schedule := jsonb_set(v_schedule, '{command_id}', to_jsonb(v_command_id), true);
    v_schedule := jsonb_set(v_schedule, '{idempotence_identity}', to_jsonb(v_idempotence_identity), true);
    v_schedule := jsonb_set(v_schedule, '{logical_day_settings_revision}', to_jsonb(v_profile_settings_revision), true);
    v_schedule := jsonb_set(v_schedule, '{timezone}', to_jsonb(v_profile_timezone), true);
    v_schedule := jsonb_set(v_schedule, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
    v_schedule := jsonb_set(v_schedule, '{source_task_revision}', to_jsonb(v_task.revision), true);
    v_schedule := jsonb_set(v_schedule, '{revision}', to_jsonb(1), true);
    v_schedule := jsonb_set(v_schedule, '{schema_contract_version}', to_jsonb('task-state-schema-v1'::text), true);
    v_schedule := jsonb_set(v_schedule, '{created_at}', to_jsonb(now()), true);
    v_schedule := jsonb_set(v_schedule, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_schedule_boundaries
    select (jsonb_populate_record(null::public.adhdice_task_schedule_boundaries, v_schedule)).*;
    v_schedule_id := (v_schedule->>'id')::uuid;
  end if;

  -- An occurrence is inserted only when a command needs durable occurrence
  -- identity.  Delay and handled outcomes never replace that identity.
  if v_occurrence <> '{}'::jsonb then
    v_occurrence := jsonb_set(v_occurrence, '{id}', to_jsonb(coalesce(nullif(v_occurrence->>'id', '')::uuid, gen_random_uuid())), true);
    v_occurrence := jsonb_set(v_occurrence, '{user_id}', to_jsonb(p_user_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{entity_id}', to_jsonb(v_entity_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_occurrence := jsonb_set(v_occurrence, '{provenance_kind}', to_jsonb('user'::text), true);
    v_occurrence := jsonb_set(v_occurrence, '{actor_kind}', to_jsonb('user'::text), true);
    v_occurrence := jsonb_set(v_occurrence, '{actor_id}', to_jsonb(p_user_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{source}', to_jsonb('task_state_command'::text), true);
    v_occurrence := jsonb_set(v_occurrence, '{command_id}', to_jsonb(v_command_id), true);
    v_occurrence := jsonb_set(v_occurrence, '{revision}', to_jsonb(1), true);
    v_occurrence := jsonb_set(v_occurrence, '{created_at}', to_jsonb(now()), true);
    v_occurrence := jsonb_set(v_occurrence, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_occurrences
    select (jsonb_populate_record(null::public.adhdice_task_occurrences, v_occurrence)).*
    on conflict (user_id, id) do nothing;
    v_occurrence_id := (v_occurrence->>'id')::uuid;
  end if;

  if nullif(v_history->>'occurrence_id', '') is not null then
    v_occurrence_id := (v_history->>'occurrence_id')::uuid;
    select * into v_occurrence_row
      from public.adhdice_task_occurrences
     where user_id = p_user_id and id = v_occurrence_id and entity_id = v_entity_id
     for update;
    if not found then
      raise exception 'History fact occurrence is not owned by the Task entity.'
        using errcode = '23503';
    end if;
  end if;

  if v_effective_override <> '{}'::jsonb then
    if v_schedule_id is null then
      v_schedule_id := nullif(v_effective_override->>'schedule_boundary_id', '')::uuid;
      select id into v_schedule_id
        from public.adhdice_task_schedule_boundaries
       where user_id = p_user_id and entity_id = v_entity_id and id = v_schedule_id;
      if not found then
        raise exception 'An effective-date override requires an owned schedule boundary.'
          using errcode = '23503';
      end if;
    end if;
    v_effective_override := jsonb_set(v_effective_override, '{id}', to_jsonb(coalesce(nullif(v_effective_override->>'id', '')::uuid, gen_random_uuid())), true);
    v_effective_override := jsonb_set(v_effective_override, '{user_id}', to_jsonb(p_user_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{entity_id}', to_jsonb(v_entity_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{occurrence_id}', to_jsonb(v_occurrence_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{schedule_boundary_id}', to_jsonb(v_schedule_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{provenance_kind}', to_jsonb('user'::text), true);
    v_effective_override := jsonb_set(v_effective_override, '{actor_kind}', to_jsonb('user'::text), true);
    v_effective_override := jsonb_set(v_effective_override, '{actor_id}', to_jsonb(p_user_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{source}', to_jsonb('task_state_command'::text), true);
    v_effective_override := jsonb_set(v_effective_override, '{command_id}', to_jsonb(v_command_id), true);
    v_effective_override := jsonb_set(v_effective_override, '{idempotence_identity}', to_jsonb(v_idempotence_identity), true);
    v_effective_override := jsonb_set(v_effective_override, '{accepted_payload_digest}', to_jsonb(v_accepted_payload_digest), true);
    v_effective_override := jsonb_set(v_effective_override, '{revision}', to_jsonb(1), true);
    v_effective_override := jsonb_set(v_effective_override, '{created_at}', to_jsonb(now()), true);
    v_effective_override := jsonb_set(v_effective_override, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_occurrence_effective_overrides
    select (jsonb_populate_record(null::public.adhdice_task_occurrence_effective_overrides, v_effective_override)).*;
    v_effective_override_id := (v_effective_override->>'id')::uuid;
  end if;

  if v_automatic_history_delete_ids <> '[]'::jsonb then
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved',
           resolved_logical_date = null,
           resolved_outcome = null,
           resolved_history_id = null,
           revision = occurrence.revision + 1,
           updated_at = now()
     where occurrence.user_id = p_user_id
       and occurrence.entity_id = v_entity_id
       and occurrence.resolved_history_id in (
         select value::uuid from jsonb_array_elements_text(v_automatic_history_delete_ids)
       );
    delete from public.adhdice_task_history_facts fact
     where fact.user_id = p_user_id
       and fact.entity_id = v_entity_id
       and fact.id in (
         select value::uuid from jsonb_array_elements_text(v_automatic_history_delete_ids)
       );
  end if;

  if v_command_type = 'clear_outcome' then
    update public.adhdice_task_occurrences occurrence
       set resolution_state = 'unresolved',
           resolved_logical_date = null,
           resolved_outcome = null,
           resolved_history_id = null,
           revision = occurrence.revision + 1,
           updated_at = now()
     where occurrence.user_id = p_user_id
       and occurrence.entity_id = v_entity_id
       and occurrence.resolved_logical_date = (v_payload->>'clear_logical_date')::date;
    update public.adhdice_task_occurrence_effective_overrides override_row
       set history_id = null,
           updated_at = now()
     where override_row.user_id = p_user_id
       and override_row.entity_id = v_entity_id
       and override_row.history_id in (
         select fact.id
           from public.adhdice_task_history_facts fact
          where fact.user_id = p_user_id
            and fact.entity_id = v_entity_id
            and fact.logical_date = (v_payload->>'clear_logical_date')::date
       );
    update public.adhdice_task_calendar_overrides calendar_override_row
       set is_active = false,
           cleared_at = now(),
           cleared_by_command_id = v_command_id,
           revision = calendar_override_row.revision + 1,
           updated_at = now()
     where calendar_override_row.user_id = p_user_id
       and calendar_override_row.entity_id = v_entity_id
       and calendar_override_row.logical_date = (v_payload->>'clear_logical_date')::date
       and calendar_override_row.is_active;
    delete from public.adhdice_task_history_facts
     where user_id = p_user_id
       and entity_id = v_entity_id
       and logical_date = (v_payload->>'clear_logical_date')::date;
  elsif v_history <> '{}'::jsonb then
    select fact.occurrence_id
      into v_prior_history_occurrence_id
      from public.adhdice_task_history_facts fact
     where fact.user_id = p_user_id
       and fact.entity_id = v_entity_id
       and fact.logical_date = nullif(v_history->>'logical_date', '')::date
     for update;
    v_history := jsonb_set(v_history, '{id}', to_jsonb(coalesce(nullif(v_history->>'id', '')::uuid, gen_random_uuid())), true);
    v_history := jsonb_set(v_history, '{user_id}', to_jsonb(p_user_id), true);
    v_history := jsonb_set(v_history, '{entity_id}', to_jsonb(v_entity_id), true);
    v_history := jsonb_set(v_history, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_history := jsonb_set(v_history, '{provenance_kind}', to_jsonb(case when v_source_kind = 'authorized_automation' then 'authorized_automation' else 'user' end), true);
    v_history := jsonb_set(v_history, '{actor_kind}', to_jsonb(case when v_source_kind = 'authorized_automation' then 'authorized_automation' else 'user' end), true);
    v_history := jsonb_set(v_history, '{actor_id}', case when v_source_kind = 'authorized_automation' then 'null'::jsonb else to_jsonb(p_user_id) end, true);
    v_history := jsonb_set(v_history, '{source}', to_jsonb('task_state_command'::text), true);
    v_history := jsonb_set(v_history, '{logical_day_settings_revision}', to_jsonb(v_profile_settings_revision), true);
    v_history := jsonb_set(v_history, '{timezone}', to_jsonb(v_profile_timezone), true);
    v_history := jsonb_set(v_history, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
    v_history := jsonb_set(v_history, '{command_id}', to_jsonb(v_command_id), true);
    v_history := jsonb_set(v_history, '{idempotence_identity}', to_jsonb(v_idempotence_identity || ':history:' || (v_history->>'logical_date') || ':' || (v_history->>'outcome')), true);
    v_history := jsonb_set(v_history, '{source_legacy_history_id}', 'null'::jsonb, true);
    v_history := jsonb_set(v_history, '{revision}', to_jsonb(1), true);
    v_history := jsonb_set(v_history, '{created_at}', to_jsonb(now()), true);
    v_history := jsonb_set(v_history, '{updated_at}', to_jsonb(now()), true);
    if v_schedule_id is not null then
      v_history := jsonb_set(v_history, '{schedule_boundary_id}', to_jsonb(v_schedule_id), true);
    end if;
    if v_occurrence_id is not null then
      v_history := jsonb_set(v_history, '{occurrence_id}', to_jsonb(v_occurrence_id), true);
    end if;
    v_history := v_history - 'reward_eligible';
    insert into public.adhdice_task_history_facts
    select (jsonb_populate_record(null::public.adhdice_task_history_facts, v_history)).*
    on conflict (user_id, entity_id, logical_date) do update
      set outcome = excluded.outcome,
          event_kind = excluded.event_kind,
          occurrence_id = excluded.occurrence_id,
          scheduled_due_on = excluded.scheduled_due_on,
          effective_due_on = excluded.effective_due_on,
          schedule_boundary_id = excluded.schedule_boundary_id,
          recurrence_source_fingerprint = excluded.recurrence_source_fingerprint,
          provenance_kind = excluded.provenance_kind,
          actor_kind = excluded.actor_kind,
          actor_id = excluded.actor_id,
          source = excluded.source,
          logical_day_settings_revision = excluded.logical_day_settings_revision,
          timezone = excluded.timezone,
          day_start_time = excluded.day_start_time,
          command_id = excluded.command_id,
          idempotence_identity = excluded.idempotence_identity,
          source_legacy_history_id = excluded.source_legacy_history_id,
          revision = public.adhdice_task_history_facts.revision + 1,
          updated_at = now()
    returning * into v_history_row;
    v_history_id := v_history_row.id;

    if v_prior_history_occurrence_id is not null
       and v_prior_history_occurrence_id is distinct from v_history_row.occurrence_id then
      update public.adhdice_task_occurrences prior_occurrence
         set resolution_state = 'unresolved',
             resolved_logical_date = null,
             resolved_outcome = null,
             resolved_history_id = null,
             revision = prior_occurrence.revision + 1,
             updated_at = now()
       where prior_occurrence.user_id = p_user_id
         and prior_occurrence.id = v_prior_history_occurrence_id
         and prior_occurrence.entity_id = v_entity_id
         and prior_occurrence.resolved_history_id = v_history_id;
    end if;

    if v_occurrence_id is not null then
      update public.adhdice_task_occurrences
         set resolution_state = 'resolved',
             resolved_logical_date = v_history_row.logical_date,
             resolved_outcome = v_history_row.outcome,
             resolved_history_id = v_history_id,
             revision = revision + 1,
             updated_at = now()
       where user_id = p_user_id and id = v_occurrence_id and entity_id = v_entity_id;
    end if;
    if v_effective_override_id is not null then
      update public.adhdice_task_occurrence_effective_overrides
         set history_id = v_history_id,
             updated_at = now()
       where user_id = p_user_id and id = v_effective_override_id;
    end if;
  end if;

  if jsonb_array_length(v_automatic_history_facts) > 0
     and not v_achievement_deferred_for_command then
    perform set_config('adhdice.achievement_deferred_user_id', p_user_id::text, true);
  end if;

  for v_automatic_history in
    select value from jsonb_array_elements(v_automatic_history_facts)
  loop
    v_automatic_history := jsonb_set(v_automatic_history, '{id}', to_jsonb(gen_random_uuid()), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{user_id}', to_jsonb(p_user_id), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{entity_id}', to_jsonb(v_entity_id), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{provenance_kind}', to_jsonb('authorized_automation'::text), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{actor_kind}', to_jsonb('authorized_automation'::text), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{actor_id}', 'null'::jsonb, true);
    v_automatic_history := jsonb_set(v_automatic_history, '{source}', to_jsonb('task_state_command'::text), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{logical_day_settings_revision}', to_jsonb(v_profile_settings_revision), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{timezone}', to_jsonb(v_profile_timezone), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{day_start_time}', to_jsonb(v_profile_day_start_time), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{command_id}', to_jsonb(v_command_id), true);
    v_automatic_history := jsonb_set(
      v_automatic_history,
      '{idempotence_identity}',
      to_jsonb(v_idempotence_identity || ':history:' || (v_automatic_history->>'logical_date') || ':missed'),
      true
    );
    v_automatic_history := jsonb_set(v_automatic_history, '{source_legacy_history_id}', 'null'::jsonb, true);
    v_automatic_history := jsonb_set(v_automatic_history, '{revision}', to_jsonb(1), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{created_at}', to_jsonb(now()), true);
    v_automatic_history := jsonb_set(v_automatic_history, '{updated_at}', to_jsonb(now()), true);

    insert into public.adhdice_task_history_facts
    select (jsonb_populate_record(null::public.adhdice_task_history_facts, v_automatic_history)).*
    on conflict (user_id, entity_id, logical_date) do nothing
    returning * into v_history_row;

    if not found then
      select * into v_history_row
        from public.adhdice_task_history_facts fact
       where fact.user_id = p_user_id
         and fact.entity_id = v_entity_id
         and fact.logical_date = (v_automatic_history->>'logical_date')::date
       for update;
      if v_history_row.provenance_kind <> 'authorized_automation'
         or v_history_row.actor_kind <> 'authorized_automation'
         or v_history_row.outcome <> 'missed'
         or v_history_row.scheduled_due_on is distinct from (v_automatic_history->>'scheduled_due_on')::date
         or v_history_row.schedule_boundary_id is distinct from (v_automatic_history->>'schedule_boundary_id')::uuid then
        raise exception 'Automatic Missed conflicts with an existing canonical History fact.'
          using errcode = '23505';
      end if;
    end if;
    v_automatic_history_ids := v_automatic_history_ids || to_jsonb(v_history_row.id);
  end loop;

  if jsonb_array_length(v_automatic_history_facts) > 0
     and not v_achievement_deferred_for_command then
    -- Keep the deferral transaction-local and restore the caller's marker
    -- before the one strict final evaluation. An outer same-user deferral is
    -- preserved for the caller; a different-user marker is never treated as a
    -- deferral for this command.
    perform set_config('adhdice.achievement_deferred_user_id', coalesce(v_achievement_deferred_user_id, ''), true);
    v_achievement_operation_id := md5('task-state-command-achievement-evaluation:' || p_user_id::text || ':' || v_command_id::text)::uuid;
    v_achievement_evaluation := public.adhdice_evaluate_achievements(
      p_user_id,
      v_achievement_operation_id,
      'immediate'
    );
    if coalesce(v_achievement_evaluation->>'status', '') not in ('completed', 'inactive') then
      raise exception 'Final Achievement evaluation failed with status % and code %.',
        coalesce(v_achievement_evaluation->>'status', 'missing'),
        coalesce(v_achievement_evaluation->>'error_code', 'unknown');
    end if;
  end if;

  -- Quota ledger rows are planner-owned facts. SQL supplies only provenance,
  -- owner, command, and timestamps; it never derives balance arithmetic from
  -- the mutable Task projection.
  for v_quota_fact in select value from jsonb_array_elements(v_quota_period_facts) as fact(value) loop
    if v_quota_fact->>'event_kind' not in ('period_close', 'clear_balance')
       or nullif(v_quota_fact->>'schedule_boundary_id', '') is null
       or nullif(v_quota_fact->>'period_key', '') is null
       or (v_quota_fact->>'period_kind') not in ('week', 'month')
       or not exists (
         select 1
           from public.adhdice_task_schedule_boundaries boundary
          where boundary.user_id = p_user_id
            and boundary.entity_id = v_entity_id
            and boundary.id = (v_quota_fact->>'schedule_boundary_id')::uuid
            and boundary.repeat_frequency = case when v_quota_fact->>'period_kind' = 'week' then 'per_week' else 'per_month' end
       ) then
      raise exception 'Quota period fact is not owned by the command Task or its schedule authority.'
        using errcode = '23503';
    end if;
    v_quota_fact := jsonb_set(v_quota_fact, '{id}', to_jsonb(gen_random_uuid()), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{user_id}', to_jsonb(p_user_id), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{entity_id}', to_jsonb(v_entity_id), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{command_id}', to_jsonb(v_command_id), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{source}', to_jsonb('task_state_command'::text), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{revision}', to_jsonb(1), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{created_at}', to_jsonb(now()), true);
    v_quota_fact := jsonb_set(v_quota_fact, '{updated_at}', to_jsonb(now()), true);
    begin
      insert into public.adhdice_task_quota_period_facts
      select (jsonb_populate_record(null::public.adhdice_task_quota_period_facts, v_quota_fact)).*;
    exception when unique_violation then
      if not exists (
        select 1 from public.adhdice_task_quota_period_facts fact
         where fact.user_id = p_user_id
           and fact.idempotence_identity = v_quota_fact->>'idempotence_identity'
      ) and not exists (
        select 1 from public.adhdice_task_quota_period_facts fact
         where fact.user_id = p_user_id
           and fact.entity_id = v_entity_id
           and fact.period_kind = v_quota_fact->>'period_kind'
           and fact.period_key = v_quota_fact->>'period_key'
           and fact.schedule_boundary_id = (v_quota_fact->>'schedule_boundary_id')::uuid
           and fact.event_kind = 'period_close'
      ) then
        raise;
      end if;
    end;
  end loop;

  if v_calendar_override <> '{}'::jsonb then
    -- Replaceable instructions retire the prior active row in this same
    -- transaction, preserving it as audit history and keeping the active
    -- unique key clear before the new row is inserted.
    update public.adhdice_task_calendar_overrides existing_override
       set is_active = false,
           cleared_at = now(),
           cleared_by_command_id = v_command_id,
           revision = existing_override.revision + 1,
           updated_at = now()
     where existing_override.user_id = p_user_id
       and existing_override.entity_id = v_entity_id
       and existing_override.logical_date = nullif(v_calendar_override->>'logical_date', '')::date
       and existing_override.is_active;
    v_calendar_override := jsonb_set(v_calendar_override, '{id}', to_jsonb(coalesce(nullif(v_calendar_override->>'id', '')::uuid, gen_random_uuid())), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{user_id}', to_jsonb(p_user_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{entity_id}', to_jsonb(v_entity_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{entity_kind}', to_jsonb(v_entity_kind), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{provenance_kind}', to_jsonb('manual'::text), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{actor_kind}', to_jsonb('user'::text), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{actor_id}', to_jsonb(p_user_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{source}', to_jsonb('task_state_command'::text), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{command_id}', to_jsonb(v_command_id), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{idempotence_identity}', to_jsonb(v_idempotence_identity), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{revision}', to_jsonb(1), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{created_at}', to_jsonb(now()), true);
    v_calendar_override := jsonb_set(v_calendar_override, '{updated_at}', to_jsonb(now()), true);
    insert into public.adhdice_task_calendar_overrides
    select (jsonb_populate_record(null::public.adhdice_task_calendar_overrides, v_calendar_override)).*;
    v_calendar_override_id := (v_calendar_override->>'id')::uuid;
  end if;

  -- The entitlement is canonical and unique per Task/logical date. Calculate
  -- its immutable reward snapshot from the same successful History streak
  -- rules used by fulfillment before the entitlement is first inserted.
  -- Legacy reward claims are deliberately not consulted or written here.
  if v_history_id is not null and v_history_row.outcome in ('done', 'did_my_best', 'complete') then
    if coalesce(v_payload->>'reward_eligible', 'false') = 'true' then
    if v_task.repeat_frequency = 'none' then
      v_reward_streak := 1;
    else
      for v_reward_streak_fact in
        select fact.outcome
          from public.adhdice_task_history_facts fact
         where fact.user_id = p_user_id
           and fact.entity_id = v_entity_id
           and fact.logical_date <= v_history_row.logical_date
         order by fact.logical_date desc, fact.updated_at desc, fact.id desc
      loop
        exit when v_reward_streak_fact.outcome not in ('done', 'did_my_best', 'complete');
        v_reward_streak := v_reward_streak + 1;
      end loop;
    end if;
    if v_reward_streak < 1 then
      raise exception 'A successful canonical History fact must produce a positive reward snapshot.'
        using errcode = '22023';
    end if;
    v_reward_units_snapshot := case
      when v_reward_streak <= 1 then 1
      when v_reward_streak = 2 then 2
      when v_reward_streak <= 6 then 3
      when v_reward_streak <= 13 then 4
      when v_reward_streak <= 29 then 5
      else 6
    end;
    v_reward_program_version := coalesce(nullif(v_payload->>'reward_program_version', ''), 'task-reward-v1');
    v_reward_event_identity := 'task-reward-entitlement:' || v_entity_id::text || ':' || v_history_row.logical_date::text || ':' || v_reward_program_version;
    insert into public.adhdice_task_reward_entitlements (
      user_id,
      entity_id,
      entity_kind,
      logical_date,
      reward_program_version,
      canonical_history_id,
      reward_units_snapshot,
      canonical_command_id,
      canonical_event_identity,
      outcome_snapshot,
      effective_obligation_identity,
      eligibility_kind,
      entitlement_source_kind,
      state
    ) values (
      p_user_id,
      v_entity_id,
      v_entity_kind,
      v_history_row.logical_date,
      v_reward_program_version,
      v_history_id,
      v_reward_units_snapshot,
      v_command_id,
      v_reward_event_identity,
      v_history_row.outcome,
      coalesce(v_history_row.occurrence_id::text, v_history_row.scheduled_due_on::text),
      case when v_source_kind = 'authorized_automation' then 'authorized_automation' else 'handled_success' end,
      'runtime_command',
      'pending'
    )
    on conflict (user_id, entity_id, logical_date) do nothing
    returning id into v_reward_entitlement_id;
    if v_reward_entitlement_id is null then
      select id into v_reward_entitlement_id
        from public.adhdice_task_reward_entitlements
       where user_id = p_user_id
         and entity_id = v_entity_id
         and logical_date = v_history_row.logical_date;
    end if;
    end if;
  end if;

  v_result := jsonb_build_object(
    'command_id', v_command_id,
    'state', 'committed',
    'conflict_code', null,
    'expected_revision', v_expected_entity_revision,
    'next_revision', v_next_revision,
    'task_id', v_entity_id,
    'history_fact_id', v_history_id,
    'history_fact_ids', v_automatic_history_ids,
    'schedule_boundary_id', v_schedule_id,
    'occurrence_id', v_occurrence_id,
    'effective_override_id', v_effective_override_id,
    'calendar_override_id', v_calendar_override_id,
    'manual_action', nullif(v_payload->>'manual_action', ''),
    'reward_entitlement_id', v_reward_entitlement_id,
    'compatibility_projection', v_projection,
    'canonical_task_patch', v_task_patch
  );

  -- The operation becomes committed only after every canonical write and the
  -- compatibility projection have succeeded in this same transaction.
  update public.adhdice_task_command_operations
     set state = 'committed',
         result_digest = md5(v_result::text),
         result_references = v_result,
         completed_at = now()
   where user_id = p_user_id and command_id = v_command_id;

  return v_result || jsonb_build_object('was_replayed', false);
end;
$function$;

revoke all on function public.adhdice_execute_task_state_command(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_execute_task_state_command(uuid, jsonb) to service_role;

-- ADHDice 7.7.39 / M3B: trusted canonical Task creation.
--
-- This is intentionally a narrow service-role-only creation RPC.  It is not a
-- general canonical patch surface and it does not create History or rewards.
-- The authenticated Edge function derives the owner and sends a validated
-- TypeScript creation plan.  This function inserts the Task and its initial
-- schedule boundary in one transaction.

create or replace function public.adhdice_create_canonical_task(
  p_user_id uuid,
  p_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_task_input public.adhdice_clean_tasks%rowtype;
  v_task public.adhdice_clean_tasks%rowtype;
  v_profile public.adhdice_user_profiles%rowtype;
  v_canonical jsonb;
  v_schedule jsonb;
  v_parent_task public.adhdice_clean_tasks%rowtype;
  v_boundary public.adhdice_task_schedule_boundaries%rowtype;
  v_now timestamptz := clock_timestamp();
  v_entity_kind text;
  v_terminal_state text;
  v_container_state text;
  v_prior_container_state text;
  v_prior_container_state_status text;
  v_workflow_state text;
  v_workflow_revision bigint;
  v_canonical_revision bigint;
  v_effective_from date;
  v_schedule_model text;
  v_repeat_frequency text;
  v_repeat_interval integer;
  v_repeat_days smallint[];
  v_repeat_day_of_month integer;
  v_repeat_monthly_mode text;
  v_repeat_monthly_ordinal text;
  v_repeat_monthly_weekday smallint;
  v_repeat_quota_count integer;
  v_repeat_quota_balance_enabled boolean;
  v_one_time_due_on date;
  v_due_time time;
  v_anchor_date date;
  v_anchor_kind text;
  v_anchor_confidence text;
  v_historical_scope_known boolean;
  v_prospective_only boolean;
  v_settings_revision bigint;
  v_timezone text;
  v_day_start_time time;
  v_source text;
begin
  if current_user <> 'service_role' then
    raise exception 'Canonical Task creation requires the trusted service-role boundary.'
      using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Canonical Task creation owner is required.' using errcode = '22023';
  end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Canonical Task creation plan must be an object.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_object_keys(p_plan) as key_name(key)
    where key not in ('task', 'canonical', 'schedule')
  ) then
    raise exception 'Canonical Task creation plan contains unsupported fields.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_plan->'task') <> 'object'
     or jsonb_typeof(p_plan->'canonical') <> 'object'
     or jsonb_typeof(p_plan->'schedule') <> 'object' then
    raise exception 'Canonical Task creation plan is incomplete.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_plan->'task') as key_name(key)
    where key not in (
      'parent_task_id', 'title', 'task_type', 'notes', 'status', 'priority', 'priority_level', 'energy',
      'is_urgent', 'is_important', 'due_on', 'active_status_logical_date', 'active_occurrence_due_on',
      'scheduled_on', 'due_time', 'estimated_minutes', 'actual_seconds', 'tags', 'external_link_label',
      'external_link_url', 'one_step_at_a_time', 'subtasks_auto_reset', 'repeat_frequency',
      'repeat_interval', 'repeat_days_of_week', 'repeat_day_of_month', 'repeat_monthly_mode',
      'repeat_monthly_ordinal', 'repeat_monthly_weekday', 'pinned_at', 'pin_order', 'sort_order',
      'completed_at', 'trashed_at', 'repeat_quota_count', 'repeat_quota_balance_enabled'
    )
  ) then
    raise exception 'Canonical Task creation task input contains privileged or unsupported fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_plan->'canonical') as key_name(key)
    where key not in (
      'entity_kind', 'terminal_state', 'container_state', 'prior_container_state',
      'prior_container_state_status', 'workflow_state', 'workflow_revision', 'canonical_revision'
    )
  ) then
    raise exception 'Canonical Task creation canonical input contains unsupported fields.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_plan->'schedule') as key_name(key)
    where key not in (
      'effective_from_logical_date', 'schedule_model', 'repeat_frequency', 'repeat_interval',
      'repeat_days_of_week', 'repeat_day_of_month', 'repeat_monthly_mode', 'repeat_monthly_ordinal',
      'repeat_monthly_weekday', 'one_time_due_on', 'due_time', 'anchor_date', 'anchor_kind',
      'anchor_confidence', 'historical_scope_known', 'prospective_only', 'logical_day_settings_revision',
      'timezone', 'day_start_time', 'source', 'repeat_quota_count', 'repeat_quota_balance_enabled'
    )
  ) then
    raise exception 'Canonical Task creation schedule input contains unsupported fields.' using errcode = '22023';
  end if;

  select * into v_profile
  from public.adhdice_user_profiles
  where user_id = p_user_id;
  if not found then
    raise exception 'Canonical logical-day profile is unavailable.' using errcode = '22023';
  end if;

  v_task_input := jsonb_populate_record(null::public.adhdice_clean_tasks, p_plan->'task');
  if nullif(btrim(v_task_input.title), '') is null then
    raise exception 'A non-empty Task title is required.' using errcode = '22023';
  end if;
  if coalesce(v_task_input.status, 'pending'::public.adhdice_clean_task_status)
      not in ('pending', 'upcoming', 'not_due', 'archived') then
    raise exception 'This Task snapshot cannot be initialized without handled provenance.' using errcode = '22023';
  end if;
  if v_task_input.completed_at is not null or v_task_input.trashed_at is not null then
    raise exception 'Terminal or Trash timestamps require canonical provenance.' using errcode = '22023';
  end if;
  if v_task_input.active_status_logical_date is not null or v_task_input.active_occurrence_due_on is not null then
    raise exception 'Initial canonical Task status projections must be null.' using errcode = '22023';
  end if;

  v_canonical := p_plan->'canonical';
  v_entity_kind := v_canonical->>'entity_kind';
  v_terminal_state := v_canonical->>'terminal_state';
  v_container_state := v_canonical->>'container_state';
  v_prior_container_state := v_canonical->>'prior_container_state';
  v_prior_container_state_status := v_canonical->>'prior_container_state_status';
  v_workflow_state := v_canonical->>'workflow_state';
  v_workflow_revision := (v_canonical->>'workflow_revision')::bigint;
  v_canonical_revision := (v_canonical->>'canonical_revision')::bigint;

  if v_entity_kind not in ('parent', 'step', 'substep')
     or v_terminal_state <> 'active'
     or v_workflow_state <> 'none'
     or v_workflow_revision <> 1
     or v_canonical_revision <> 1
     or v_prior_container_state is not null
     or v_prior_container_state_status <> 'not_applicable' then
    raise exception 'Initial canonical Task state is invalid.' using errcode = '22023';
  end if;
  if v_container_state not in ('active', 'archived') then
    raise exception 'Initial canonical Task container state is invalid.' using errcode = '22023';
  end if;
  if (v_task_input.status = 'archived' and v_container_state <> 'archived')
     or (v_task_input.status is distinct from 'archived' and v_container_state <> 'active') then
    raise exception 'Initial canonical container state does not match the Task snapshot.' using errcode = '22023';
  end if;

  if v_task_input.parent_task_id is null then
    if v_entity_kind <> 'parent' then
      raise exception 'A root Task must use the parent canonical entity kind.' using errcode = '22023';
    end if;
  else
    select * into v_parent_task
    from public.adhdice_clean_tasks
    where user_id = p_user_id and id = v_task_input.parent_task_id;
    if not found then
      raise exception 'The Task parent was not found for this owner.' using errcode = '23503';
    end if;
    if (v_parent_task.parent_task_id is null and v_entity_kind <> 'step')
       or (v_parent_task.parent_task_id is not null and v_entity_kind <> 'substep') then
      raise exception 'The canonical Task entity kind does not match its parent relationship.' using errcode = '22023';
    end if;
  end if;

  v_schedule := p_plan->'schedule';
  if jsonb_typeof(v_schedule->'repeat_days_of_week') <> 'array' then
    raise exception 'Canonical Task repeat weekdays must be an array.' using errcode = '22023';
  end if;
  v_effective_from := (v_schedule->>'effective_from_logical_date')::date;
  v_schedule_model := v_schedule->>'schedule_model';
  v_repeat_frequency := v_schedule->>'repeat_frequency';
  v_repeat_interval := (v_schedule->>'repeat_interval')::integer;
  v_repeat_days := array(
    select value::smallint
    from jsonb_array_elements_text(v_schedule->'repeat_days_of_week') as item(value)
  );
  v_repeat_day_of_month := nullif(v_schedule->>'repeat_day_of_month', '')::integer;
  v_repeat_monthly_mode := v_schedule->>'repeat_monthly_mode';
  v_repeat_monthly_ordinal := v_schedule->>'repeat_monthly_ordinal';
  v_repeat_monthly_weekday := nullif(v_schedule->>'repeat_monthly_weekday', '')::smallint;
  v_repeat_quota_count := nullif(v_schedule->>'repeat_quota_count', '')::integer;
  v_repeat_quota_balance_enabled := coalesce((v_schedule->>'repeat_quota_balance_enabled')::boolean, false);
  v_one_time_due_on := nullif(v_schedule->>'one_time_due_on', '')::date;
  v_due_time := nullif(v_schedule->>'due_time', '')::time;
  v_anchor_date := nullif(v_schedule->>'anchor_date', '')::date;
  v_anchor_kind := v_schedule->>'anchor_kind';
  v_anchor_confidence := v_schedule->>'anchor_confidence';
  v_historical_scope_known := (v_schedule->>'historical_scope_known')::boolean;
  v_prospective_only := (v_schedule->>'prospective_only')::boolean;
  v_settings_revision := (v_schedule->>'logical_day_settings_revision')::bigint;
  v_timezone := v_schedule->>'timezone';
  v_day_start_time := (v_schedule->>'day_start_time')::time;
  v_source := v_schedule->>'source';

  if v_schedule_model not in ('unscheduled', 'one_time', 'rolling', 'fixed')
     or v_repeat_frequency not in ('none', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete', 'per_week', 'per_month')
     or v_repeat_interval < 1
     or cardinality(v_repeat_days) > 7
     or not (v_repeat_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
     or v_repeat_monthly_mode not in ('day_of_month', 'ordinal_weekday')
     or (v_repeat_monthly_ordinal is not null and v_repeat_monthly_ordinal not in ('first', 'second', 'third', 'fourth', 'last'))
     or (v_repeat_monthly_weekday is not null and v_repeat_monthly_weekday not between 0 and 6)
     or v_anchor_kind not in ('user_selected', 'unknown')
     or v_anchor_confidence not in ('proven', 'unavailable')
     or v_source not in ('task_creation', 'task_import') then
    raise exception 'Canonical Task schedule is invalid.' using errcode = '22023';
  end if;
  if (v_repeat_frequency = 'per_week' and (v_repeat_quota_count is null or v_repeat_quota_count not between 1 and 7))
     or (v_repeat_frequency = 'per_month' and (v_repeat_quota_count is null or v_repeat_quota_count not between 1 and 31))
     or (v_repeat_frequency not in ('per_week', 'per_month')
         and (v_repeat_quota_count is not null or v_repeat_quota_balance_enabled)) then
    raise exception 'Canonical Task quota recurrence fields are invalid.' using errcode = '22023';
  end if;
  if v_repeat_frequency not in ('per_week', 'per_month')
     and (v_task_input.repeat_quota_count is not null or v_task_input.repeat_quota_balance_enabled is true) then
    raise exception 'Canonical Task quota fields cannot be supplied for a non-quota repeat.' using errcode = '22023';
  end if;
  if v_repeat_frequency in ('per_week', 'per_month')
     and v_task_input.repeat_quota_count is not null
     and v_task_input.repeat_quota_count is distinct from v_repeat_quota_count then
    raise exception 'Canonical Task task and schedule quota counts must match.' using errcode = '22023';
  end if;
  if v_repeat_frequency in ('per_week', 'per_month')
     and v_task_input.repeat_quota_balance_enabled is not null
     and v_task_input.repeat_quota_balance_enabled is distinct from v_repeat_quota_balance_enabled then
    raise exception 'Canonical Task task and schedule quota balance settings must match.' using errcode = '22023';
  end if;
  if (v_schedule_model = 'unscheduled' and (v_repeat_frequency <> 'none' or v_one_time_due_on is not null or v_anchor_date is not null))
     or (v_schedule_model = 'one_time' and (v_repeat_frequency <> 'none' or v_one_time_due_on is null))
     or (v_schedule_model in ('rolling', 'fixed') and v_repeat_frequency = 'none') then
    raise exception 'Canonical Task schedule model does not match its repeat metadata.' using errcode = '22023';
  end if;
  if (v_anchor_confidence = 'proven' and v_anchor_date is null)
     or (v_anchor_confidence = 'unavailable' and v_anchor_date is not null)
     or (v_anchor_kind = 'unknown' and v_anchor_date is not null) then
    raise exception 'Canonical Task schedule anchor is invalid.' using errcode = '22023';
  end if;
  if v_historical_scope_known is distinct from false or v_prospective_only is distinct from true then
    raise exception 'New Task schedule provenance must be prospective and retain no invented historical scope.' using errcode = '22023';
  end if;
  if v_timezone is distinct from v_profile.timezone
     or v_day_start_time is distinct from v_profile.day_start_time::time
     or v_settings_revision is distinct from v_profile.settings_revision then
    raise exception 'Canonical logical-day settings do not match the owner profile.' using errcode = '22023';
  end if;

  insert into public.adhdice_clean_tasks (
    user_id, parent_task_id, revision, title, task_type, notes, status, priority, priority_level, energy,
    is_urgent, is_important, due_on, active_status_logical_date, active_occurrence_due_on,
    scheduled_on, due_time, estimated_minutes, actual_seconds, tags, external_link_label,
    external_link_url, one_step_at_a_time, subtasks_auto_reset, repeat_frequency, repeat_interval,
    repeat_days_of_week, repeat_day_of_month, repeat_monthly_mode, repeat_monthly_ordinal,
    repeat_quota_count, repeat_quota_balance_enabled, repeat_quota_balance, repeat_quota_balance_period,
    repeat_monthly_weekday, pinned_at, pin_order, sort_order, completed_at, trashed_at,
    canonicalization_status, entity_kind, terminal_state, container_state, prior_container_state,
    prior_container_state_status, terminal_completed_at, container_trashed_at, workflow_state,
    workflow_started_at, workflow_logical_date, workflow_occurrence_id, workflow_command_id,
    workflow_revision, canonical_revision, canonical_created_at, canonical_updated_at,
    projection_source_canonical_revision, projection_source_fingerprint, projection_version
  )
  values (
    p_user_id, v_task_input.parent_task_id, 1, btrim(v_task_input.title), coalesce(v_task_input.task_type, 'task'), v_task_input.notes,
    coalesce(v_task_input.status, 'pending'::public.adhdice_clean_task_status),
    coalesce(v_task_input.priority, 'normal'::public.adhdice_clean_task_priority),
    coalesce(v_task_input.priority_level, 0), coalesce(v_task_input.energy, 'none'::public.adhdice_clean_task_energy),
    coalesce(v_task_input.is_urgent, false), coalesce(v_task_input.is_important, false), v_task_input.due_on,
    null, null, v_task_input.scheduled_on, v_task_input.due_time, v_task_input.estimated_minutes,
    coalesce(v_task_input.actual_seconds, 0), coalesce(v_task_input.tags, '{}'::text[]),
    v_task_input.external_link_label, v_task_input.external_link_url,
    coalesce(v_task_input.one_step_at_a_time, false), coalesce(v_task_input.subtasks_auto_reset, false),
    coalesce(v_task_input.repeat_frequency, 'none'::public.adhdice_clean_task_repeat_frequency),
    coalesce(v_task_input.repeat_interval, 1), coalesce(v_task_input.repeat_days_of_week, '{}'::smallint[]),
    v_task_input.repeat_day_of_month, coalesce(v_task_input.repeat_monthly_mode, 'day_of_month'::public.adhdice_clean_task_repeat_monthly_mode),
    v_task_input.repeat_monthly_ordinal, v_task_input.repeat_monthly_weekday,
    case when v_repeat_frequency in ('per_week', 'per_month') then v_repeat_quota_count else null end,
    case when v_repeat_frequency in ('per_week', 'per_month') then v_repeat_quota_balance_enabled else false end,
    case when v_repeat_frequency in ('per_week', 'per_month') and v_repeat_quota_balance_enabled then 0 else null end,
    case when v_repeat_frequency = 'per_week' and v_repeat_quota_balance_enabled then v_effective_from - ((extract(isodow from v_effective_from)::integer - 1) % 7)
         when v_repeat_frequency = 'per_month' and v_repeat_quota_balance_enabled then date_trunc('month', v_effective_from)::date
         else null end::text,
    v_task_input.pinned_at,
    v_task_input.pin_order, coalesce(v_task_input.sort_order, 0), null, null,
    'canonical_runtime', v_entity_kind, v_terminal_state, v_container_state, null, v_prior_container_state_status,
    null, null, v_workflow_state, null, null, null, null, v_workflow_revision, v_canonical_revision,
    v_now, v_now, v_canonical_revision, 'canonical-task-create-v1:' || md5(p_plan::text), 'task-state-create-v1'
  )
  returning * into v_task;

  insert into public.adhdice_task_schedule_boundaries (
    user_id, entity_id, entity_kind, effective_from_logical_date, boundary_sequence, boundary_type,
    schedule_model, repeat_frequency, repeat_interval, repeat_days_of_week, repeat_day_of_month,
    repeat_monthly_mode, repeat_monthly_ordinal, repeat_monthly_weekday, repeat_quota_count,
    repeat_quota_balance_enabled, one_time_due_on, due_time,
    anchor_date, anchor_kind, anchor_confidence, historical_scope_known, prospective_only,
    prior_boundary_id, affected_occurrence_id, logical_day_settings_revision, timezone, day_start_time,
    actor_kind, actor_id, source, command_id, idempotence_identity, migration_operation_id,
    migration_version, classifier_version, schema_contract_version, source_task_revision, revision,
    created_at, updated_at
  )
  values (
    p_user_id, v_task.id, v_entity_kind, v_effective_from, 1, 'initial', v_schedule_model,
    v_repeat_frequency, v_repeat_interval, v_repeat_days, v_repeat_day_of_month, v_repeat_monthly_mode,
    v_repeat_monthly_ordinal, v_repeat_monthly_weekday, v_repeat_quota_count,
    v_repeat_quota_balance_enabled, v_one_time_due_on, v_due_time, v_anchor_date,
    v_anchor_kind, v_anchor_confidence, v_historical_scope_known, v_prospective_only, null, null,
    v_settings_revision, v_timezone, v_day_start_time, 'user', p_user_id, v_source, null,
    'task-create:' || v_task.id::text, null, null, null, 'task-state-schema-v1', 1, 1, v_now, v_now
  )
  returning * into v_boundary;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'canonical_schedule_boundary', to_jsonb(v_boundary)
  );
end;
$function$;

revoke all on function public.adhdice_create_canonical_task(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adhdice_create_canonical_task(uuid, jsonb) to service_role;

create or replace function public.adhdice_get_task_current_projection_source_fences(
  p_user_id uuid,
  p_entity_id uuid,
  p_projected_logical_date date
)
returns table(
  schedule_boundary_revision text,
  behavior_policy_revision text
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_task public.adhdice_clean_tasks%rowtype;
  v_schedule_payload jsonb;
  v_behavior_payload jsonb;
  v_tracking_payload jsonb;
  v_tracking_malformed boolean;
begin
  if current_user <> 'service_role' then
    raise exception 'Current Task projection source fences are backend-only.'
      using errcode = '42501';
  end if;
  if p_user_id is null or p_entity_id is null or p_projected_logical_date is null then
    raise exception 'Current Task projection source-fence identity is required.'
      using errcode = '22023';
  end if;

  select task.* into v_task
    from public.adhdice_clean_tasks task
   where task.user_id = p_user_id
     and task.id = p_entity_id
     and task.permanently_deleted_at is null;
  if not found then
    raise exception 'Current Task projection source-fence Task is missing or not owned by the backend request.'
      using errcode = '42501';
  end if;

  with recursive ancestry as (
    select task.id,
           task.user_id,
           task.parent_task_id,
           task.exclude_from_tracking,
           array[task.id]::uuid[] as path,
           false as cycle_detected,
           0 as depth
      from public.adhdice_clean_tasks task
     where task.user_id = p_user_id
       and task.id = p_entity_id
    union all
    select parent.id,
           parent.user_id,
           parent.parent_task_id,
           parent.exclude_from_tracking,
           ancestry.path || parent.id,
           parent.id = any(ancestry.path),
           ancestry.depth + 1
      from ancestry
      join public.adhdice_clean_tasks parent
        on parent.user_id = p_user_id
       and parent.id = ancestry.parent_task_id
     where ancestry.parent_task_id is not null
       and not ancestry.cycle_detected
       and ancestry.depth < 256
  )
  select
    coalesce(bool_or(
      ancestry.cycle_detected
      or (ancestry.parent_task_id is not null and not exists (
        select 1
          from public.adhdice_clean_tasks missing_parent
         where missing_parent.user_id = p_user_id
           and missing_parent.id = ancestry.parent_task_id
      ))
      or (ancestry.depth >= 256 and ancestry.parent_task_id is not null)
    ), false),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', ancestry.id,
        'parent_task_id', ancestry.parent_task_id,
        'exclude_from_tracking', ancestry.exclude_from_tracking
      ) order by ancestry.depth
    ), '[]'::jsonb)
    into v_tracking_malformed, v_tracking_payload
    from ancestry;

  if v_tracking_malformed then
    raise exception 'Current Task projection tracking hierarchy is malformed.'
      using errcode = '55000';
  end if;

  v_schedule_payload := pg_catalog.jsonb_build_object(
    'version', 'task-current-projection-schedule-fence-v2',
    'user_id', p_user_id,
    'entity_id', p_entity_id,
    'boundaries', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(boundary) - array['created_at', 'updated_at']::text[]
        order by boundary.boundary_sequence, boundary.id
      )
        from public.adhdice_task_schedule_boundaries boundary
       where boundary.user_id = p_user_id
         and boundary.entity_id = p_entity_id
    ), '[]'::jsonb),
    'quota_period_facts', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(fact) - array['created_at', 'updated_at']::text[]
        order by fact.period_start, fact.created_at, fact.id
      )
        from public.adhdice_task_quota_period_facts fact
       where fact.user_id = p_user_id
         and fact.entity_id = p_entity_id
    ), '[]'::jsonb),
    'occurrences', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(occurrence) - array['created_at', 'updated_at']::text[]
        order by occurrence.scheduled_due_on, occurrence.id
      )
        from public.adhdice_task_occurrences occurrence
       where occurrence.user_id = p_user_id
         and occurrence.entity_id = p_entity_id
         and occurrence.resolution_state <> 'superseded'
    ), '[]'::jsonb),
    'occurrence_effective_overrides', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(override_row) - array['created_at', 'updated_at']::text[]
        order by override_row.action_logical_date, override_row.override_sequence, override_row.id
      )
        from public.adhdice_task_occurrence_effective_overrides override_row
       where override_row.user_id = p_user_id
         and override_row.entity_id = p_entity_id
    ), '[]'::jsonb),
    'active_calendar_overrides', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(calendar_row) - array['created_at', 'updated_at']::text[]
        order by calendar_row.logical_date, calendar_row.id
      )
        from public.adhdice_task_calendar_overrides calendar_row
       where calendar_row.user_id = p_user_id
         and calendar_row.entity_id = p_entity_id
         and calendar_row.is_active
    ), '[]'::jsonb)
  );

  with relevant_selections as (
    select selection.*
      from public.adhdice_task_behavior_selections selection
     where selection.user_id = p_user_id
       and selection.task_id = p_entity_id
       and (
         selection.effective_from_logical_date <= p_projected_logical_date
         or selection.effective_from_logical_date = (
           select min(first_selection.effective_from_logical_date)
             from public.adhdice_task_behavior_selections first_selection
            where first_selection.user_id = p_user_id
              and first_selection.task_id = p_entity_id
         )
       )
  ), relevant_rulesets as (
    select v_task.custom_ruleset_id as ruleset_id
     where v_task.custom_ruleset_id is not null
    union
    select selection.custom_ruleset_id
      from relevant_selections selection
     where selection.custom_ruleset_id is not null
  )
  select pg_catalog.jsonb_build_object(
    'version', 'task-current-projection-behavior-fence-v3',
    'user_id', p_user_id,
    'entity_id', p_entity_id,
    'projected_logical_date', p_projected_logical_date,
    'tracking_ancestry', v_tracking_payload,
    'effective_tracking_exclusion', exists (
      select 1
        from pg_catalog.jsonb_array_elements(v_tracking_payload) as ancestry_row(row_json)
       where (ancestry_row.row_json->>'exclude_from_tracking')::boolean is true
    ),
    'task_identity', pg_catalog.jsonb_build_object(
      'task_type', v_task.task_type,
      'custom_ruleset_id', v_task.custom_ruleset_id
    ),
    'selections', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(selection) - array['created_at', 'updated_at']::text[]
        order by selection.effective_from_logical_date, selection.id
      )
        from relevant_selections selection
    ), '[]'::jsonb),
    'task_type_behavior_profiles', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(profile) - array['created_at', 'updated_at']::text[]
        order by profile.task_type, profile.effective_from_logical_date
      )
        from public.adhdice_task_type_behavior_profiles profile
       where profile.user_id = p_user_id
         and profile.task_type = 'task'
         and (
           profile.effective_from_logical_date <= p_projected_logical_date
           or profile.effective_from_logical_date = (
             select min(first_profile.effective_from_logical_date)
               from public.adhdice_task_type_behavior_profiles first_profile
              where first_profile.user_id = p_user_id
                and first_profile.task_type = 'task'
           )
         )
         and (
           v_task.task_type = 'task'
           or exists (
             select 1
               from relevant_selections selection
              where selection.task_type = 'task'
           )
         )
    ), '[]'::jsonb),
    'named_custom_ruleset_identities', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', ruleset.id,
          'user_id', ruleset.user_id,
          'task_type', ruleset.task_type,
          'deleted_at', ruleset.deleted_at
        )
        order by ruleset.id
      )
        from public.adhdice_custom_behavior_rulesets ruleset
       where ruleset.user_id = p_user_id
         and ruleset.id in (select relevant_rulesets.ruleset_id from relevant_rulesets)
    ), '[]'::jsonb),
    'named_custom_ruleset_revisions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(revision) - array['created_at', 'updated_at']::text[]
        order by revision.ruleset_id, revision.effective_from_logical_date
      )
        from public.adhdice_custom_behavior_ruleset_revisions revision
       where revision.ruleset_id in (select relevant_rulesets.ruleset_id from relevant_rulesets)
         and (
           revision.effective_from_logical_date <= p_projected_logical_date
           or revision.effective_from_logical_date = (
             select min(first_revision.effective_from_logical_date)
               from public.adhdice_custom_behavior_ruleset_revisions first_revision
              where first_revision.ruleset_id = revision.ruleset_id
           )
         )
    ), '[]'::jsonb)
  ) into v_behavior_payload;

  return query
  select 'sha256:' || pg_catalog.encode(
           extensions.digest(v_schedule_payload::text, 'sha256'::text),
           'hex'
         ),
         'sha256:' || pg_catalog.encode(
           extensions.digest(v_behavior_payload::text, 'sha256'::text),
           'hex'
         );
end;
$function$;

drop trigger if exists adhdice_task_quota_period_facts_invalidate_task_current_projection
  on public.adhdice_task_quota_period_facts;
create trigger adhdice_task_quota_period_facts_invalidate_task_current_projection
after insert or update or delete on public.adhdice_task_quota_period_facts
for each row execute function public.adhdice_invalidate_task_current_projection_entity_trigger();

commit;

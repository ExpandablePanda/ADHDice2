-- ADHDice 7.16.82: inclusive recurrence End Date.
--
-- Source-only migration. Do not execute or deploy from this workspace.
-- Existing Task rows and schedule boundaries remain NULL (indefinite).

begin;

alter table public.adhdice_clean_tasks
  add column if not exists repeat_end_on date;

alter table public.adhdice_task_schedule_boundaries
  add column if not exists repeat_end_on date;

do $ddl$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'adhdice_clean_tasks_repeat_end_on_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_repeat_end_on_check check (
        repeat_frequency <> 'none'
        or repeat_end_on is null
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'adhdice_clean_tasks_repeat_end_on_due_check'
  ) then
    alter table public.adhdice_clean_tasks
      add constraint adhdice_clean_tasks_repeat_end_on_due_check check (
        repeat_frequency = 'none'
        or repeat_end_on is null
        or due_on is null
        or repeat_end_on >= due_on
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'adhdice_task_schedule_boundaries_repeat_end_on_check'
  ) then
    alter table public.adhdice_task_schedule_boundaries
      add constraint adhdice_task_schedule_boundaries_repeat_end_on_check check (
        (
          schedule_model in ('unscheduled', 'one_time')
          and repeat_end_on is null
        )
        or (
          schedule_model in ('rolling', 'fixed')
          and (repeat_end_on is null or anchor_date is null or repeat_end_on >= anchor_date)
        )
      );
  end if;
end;
$ddl$;

-- The command RPC already persists arbitrary schedule-boundary columns through
-- jsonb_populate_record. Add the compatibility projection write for the new
-- Task column while preserving the existing trusted RPC and its grants.
do $rpc$
declare
  definition text;
begin
  if to_regprocedure('public.adhdice_execute_task_state_command(uuid,jsonb)') is null then
    raise exception 'The canonical Task State command RPC is required before 7.16.82.';
  end if;
  definition := pg_get_functiondef('public.adhdice_execute_task_state_command(uuid,jsonb)'::regprocedure);
  if position('repeat_end_on = case' in definition) = 0 then
    if position('repeat_frequency = case' in definition) = 0
       or position('repeat_quota_count = case' in definition) = 0
       or position('repeat_frequency = case' in definition) > position('repeat_quota_count = case' in definition) then
      raise exception 'Could not patch the canonical Task State command RPC: current repeat_frequency assignment shape is missing.';
    end if;
    definition := regexp_replace(
      definition,
      $needle$(         repeat_frequency = case.*?)(         repeat_quota_count = case)$needle$,
      $replacement$\1         repeat_end_on = case
           when v_schedule <> '{}'::jsonb and coalesce(v_schedule->>'repeat_frequency', 'none') in ('per_week', 'per_month', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete')
             then nullif(v_schedule->>'repeat_end_on', '')::date
           when v_schedule <> '{}'::jsonb then null
           else repeat_end_on
         end,
\2$replacement$,
      1,
      's'
    );
    if position('repeat_end_on = case' in definition) = 0 then
      raise exception 'Could not patch the canonical Task State command RPC for repeat_end_on.';
    end if;
    execute definition;
  end if;
end;
$rpc$;

-- Extend canonical creation's trusted allowlists, validation, Task insert, and
-- initial schedule-boundary insert. The function body is reconstructed from
-- the installed definition so this migration remains forward-only and does
-- not duplicate the large RPC implementation.
do $rpc$
declare
  definition text;
begin
  if to_regprocedure('public.adhdice_create_canonical_task(uuid,jsonb)') is null then
    raise exception 'The canonical Task creation RPC is required before 7.16.82.';
  end if;
  definition := pg_get_functiondef('public.adhdice_create_canonical_task(uuid,jsonb)'::regprocedure);
  if position('v_repeat_end_on date' in definition) = 0 then
    definition := replace(
      definition,
      $needle$  v_repeat_monthly_weekday smallint;
  v_repeat_quota_count integer;$needle$,
      $replacement$  v_repeat_monthly_weekday smallint;
  v_repeat_end_on date;
  v_repeat_quota_count integer;$replacement$
    );
    definition := replace(
      definition,
      $needle$'completed_at', 'trashed_at', 'repeat_quota_count', 'repeat_quota_balance_enabled'$needle$,
      $replacement$'completed_at', 'trashed_at', 'repeat_quota_count', 'repeat_quota_balance_enabled', 'repeat_end_on'$replacement$
    );
    definition := replace(
      definition,
      $needle$'timezone', 'day_start_time', 'source', 'repeat_quota_count', 'repeat_quota_balance_enabled'$needle$,
      $replacement$'timezone', 'day_start_time', 'source', 'repeat_quota_count', 'repeat_quota_balance_enabled', 'repeat_end_on'$replacement$
    );
    definition := replace(
      definition,
      $needle$  v_repeat_quota_balance_enabled := coalesce((v_schedule->>'repeat_quota_balance_enabled')::boolean, false);
  v_one_time_due_on :=$needle$,
      $replacement$  v_repeat_quota_balance_enabled := coalesce((v_schedule->>'repeat_quota_balance_enabled')::boolean, false);
  v_repeat_end_on := nullif(v_schedule->>'repeat_end_on', '')::date;
  v_one_time_due_on :=$replacement$
    );
    definition := replace(
      definition,
      $needle$  if (v_anchor_confidence = 'proven' and v_anchor_date is null)$needle$,
      $replacement$  if v_repeat_frequency = 'none' and v_repeat_end_on is not null then
    raise exception 'Canonical Task recurrence End Date requires a repeating schedule.' using errcode = '22023';
  end if;
  if v_repeat_frequency <> 'none'
     and v_repeat_end_on is not null
     and v_task_input.due_on is not null
     and v_repeat_end_on < v_task_input.due_on then
    raise exception 'Canonical Task recurrence End Date must be on or after the initial due date.' using errcode = '22023';
  end if;
  if v_task_input.repeat_end_on is distinct from v_repeat_end_on then
    raise exception 'Canonical Task task and schedule recurrence End Date values must match.' using errcode = '22023';
  end if;
  if (v_anchor_confidence = 'proven' and v_anchor_date is null)$replacement$
    );
    definition := replace(
      definition,
      $needle$    repeat_monthly_weekday, repeat_quota_count, repeat_quota_balance_enabled, repeat_quota_balance,$needle$,
      $replacement$    repeat_monthly_weekday, repeat_end_on, repeat_quota_count, repeat_quota_balance_enabled, repeat_quota_balance,$replacement$
    );
    definition := replace(
      definition,
      $needle$    v_task_input.repeat_monthly_ordinal, v_task_input.repeat_monthly_weekday,
    case when v_repeat_frequency in ('per_week', 'per_month') then v_repeat_quota_count else null end,$needle$,
      $replacement$    v_task_input.repeat_monthly_ordinal, v_task_input.repeat_monthly_weekday, v_repeat_end_on,
    case when v_repeat_frequency in ('per_week', 'per_month') then v_repeat_quota_count else null end,$replacement$
    );
    definition := replace(
      definition,
      $needle$    repeat_monthly_mode, repeat_monthly_ordinal, repeat_monthly_weekday, repeat_quota_count,$needle$,
      $replacement$    repeat_monthly_mode, repeat_monthly_ordinal, repeat_monthly_weekday, repeat_end_on, repeat_quota_count,$replacement$
    );
    definition := replace(
      definition,
      $needle$    v_repeat_monthly_ordinal, v_repeat_monthly_weekday, v_repeat_quota_count,$needle$,
      $replacement$    v_repeat_monthly_ordinal, v_repeat_monthly_weekday, v_repeat_end_on, v_repeat_quota_count,$replacement$
    );
    if position('v_repeat_end_on date' in definition) = 0
       or position('repeat_end_on, repeat_quota_count' in definition) = 0 then
      raise exception 'Could not patch the canonical Task creation RPC for repeat_end_on.';
    end if;
    execute definition;
  end if;
end;
$rpc$;

commit;

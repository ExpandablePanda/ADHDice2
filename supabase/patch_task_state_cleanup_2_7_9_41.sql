-- Task State Cleanup 2: retire the obsolete pre-canonical rollover authorities.
-- This migration intentionally leaves canonical Task State, History, and data tables untouched.

drop function if exists public.adhdice_reconcile_task_rollover(
  uuid,
  timestamp with time zone
);

drop function if exists public.adhdice_apply_task_state_engine_rollover(
  uuid,
  jsonb,
  timestamp with time zone
);

drop function if exists public.adhdice_task_next_due_date(
  public.adhdice_clean_task_repeat_frequency,
  integer,
  smallint[],
  integer,
  date
);

drop function if exists public.adhdice_task_next_due_date(
  public.adhdice_clean_task_repeat_frequency,
  integer,
  smallint[],
  integer,
  date,
  public.adhdice_clean_task_repeat_monthly_mode,
  public.adhdice_clean_task_repeat_monthly_ordinal,
  smallint
);

drop function if exists public.adhdice_resolve_recurring_due_status(
  date,
  time without time zone,
  date,
  time without time zone
);

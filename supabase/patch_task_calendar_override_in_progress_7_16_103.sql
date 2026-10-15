-- Source-only migration for ADHDice 7.16.103.
-- Apply through the normal reviewed Supabase migration process; this file is
-- intentionally not executed by the local QA task.

begin;

alter table public.adhdice_task_calendar_overrides
  drop constraint if exists adhdice_task_calendar_overrides_override_state_check;

alter table public.adhdice_task_calendar_overrides
  add constraint adhdice_task_calendar_overrides_override_state_check
  check (override_state in ('unscheduled', 'not_due', 'due_open', 'blank_due', 'in_progress'));

commit;

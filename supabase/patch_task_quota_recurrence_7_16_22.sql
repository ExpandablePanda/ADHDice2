-- ADHDice 7.16.22: first-class X Per Week / X Per Month quota recurrence.
-- Source-only migration. Apply through the normal reviewed Supabase migration
-- workflow after patch_task_quota_recurrence_enum_7_16_22.sql has committed;
-- this file is intentionally not executed by the client or agent.

alter table public.adhdice_clean_tasks
  add column if not exists repeat_quota_count integer,
  add column if not exists repeat_quota_balance_enabled boolean not null default false,
  add column if not exists repeat_quota_balance integer,
  add column if not exists repeat_quota_balance_period text;

alter table public.adhdice_clean_tasks
  drop constraint if exists adhdice_clean_tasks_quota_fields_check;
alter table public.adhdice_clean_tasks
  add constraint adhdice_clean_tasks_quota_fields_check check (
    (
      repeat_frequency = 'per_week'
      and repeat_quota_count between 1 and 7
    )
    or (
      repeat_frequency = 'per_month'
      and repeat_quota_count between 1 and 31
    )
    or (
      repeat_frequency not in ('per_week', 'per_month')
      and repeat_quota_count is null
      and repeat_quota_balance_enabled = false
      and repeat_quota_balance is null
      and repeat_quota_balance_period is null
    )
  );

alter table public.adhdice_task_schedule_boundaries
  add column if not exists repeat_quota_count integer,
  add column if not exists repeat_quota_balance_enabled boolean not null default false;

alter table public.adhdice_task_schedule_boundaries
  drop constraint if exists adhdice_task_schedule_boundaries_repeat_frequency_check;
alter table public.adhdice_task_schedule_boundaries
  drop constraint if exists adhdice_task_schedule_boundaries_quota_fields_check;
alter table public.adhdice_task_schedule_boundaries
  add constraint adhdice_task_schedule_boundaries_repeat_frequency_check check (
    repeat_frequency in ('none', 'daily', 'weekly', 'monthly', 'custom', 'daily_until_complete', 'per_week', 'per_month')
  ),
  add constraint adhdice_task_schedule_boundaries_quota_fields_check check (
    (
      repeat_frequency = 'per_week'
      and repeat_quota_count between 1 and 7
    )
    or (
      repeat_frequency = 'per_month'
      and repeat_quota_count between 1 and 31
    )
    or (
      repeat_frequency not in ('per_week', 'per_month')
      and repeat_quota_count is null
      and repeat_quota_balance_enabled = false
    )
  );

create table if not exists public.adhdice_task_quota_period_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_id uuid not null,
  entity_kind text not null check (entity_kind in ('parent', 'step', 'substep')),
  period_kind text not null check (period_kind in ('week', 'month')),
  period_key text not null check (char_length(trim(period_key)) between 1 and 16),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  base_quota integer not null check (base_quota between 1 and 31),
  incoming_balance integer not null default 0,
  successful_days integer not null default 0 check (successful_days >= 0),
  next_balance integer not null default 0,
  balance_enabled boolean not null,
  event_kind text not null check (event_kind in ('period_close', 'clear_balance')),
  command_id uuid,
  idempotence_identity text not null check (char_length(trim(idempotence_identity)) > 0),
  source text not null default 'task_state_command',
  created_at timestamptz not null default now(),
  constraint adhdice_task_quota_period_facts_id_key unique (user_id, id),
  constraint adhdice_task_quota_period_facts_identity_key unique (user_id, idempotence_identity),
  constraint adhdice_task_quota_period_facts_period_key check (
    (period_kind = 'week' and period_key = to_char(period_start, 'YYYY-MM-DD'))
    or (period_kind = 'month' and period_key = to_char(period_start, 'YYYY-MM'))
  ),
  constraint adhdice_task_quota_period_facts_balance_check check (
    balance_enabled or (incoming_balance = 0 and next_balance = 0)
  )
);

create index if not exists adhdice_task_quota_period_facts_entity_period_idx
  on public.adhdice_task_quota_period_facts (user_id, entity_id, period_kind, period_start desc);

alter table public.adhdice_task_quota_period_facts enable row level security;
revoke all on table public.adhdice_task_quota_period_facts from public, anon, authenticated;
grant select on table public.adhdice_task_quota_period_facts to authenticated;
drop policy if exists "Users can read quota period facts" on public.adhdice_task_quota_period_facts;
create policy "Users can read quota period facts"
  on public.adhdice_task_quota_period_facts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

do $$
begin
  if to_regclass('public.adhdice_task_command_operations') is not null then
    alter table public.adhdice_task_command_operations
      drop constraint if exists adhdice_task_command_operations_command_type_check;
    alter table public.adhdice_task_command_operations
      add constraint adhdice_task_command_operations_command_type_check check (command_type in (
        'set_outcome', 'clear_outcome', 'clear_quota_balance', 'complete_task', 'delay_occurrence',
        'set_due_date', 'set_repeat', 'calendar_override', 'archive_task', 'trash_task',
        'restore_task', 'start_in_progress', 'clear_in_progress', 'reconcile_rollover', 'hierarchy_change'
      ));
  end if;
end;
$$;

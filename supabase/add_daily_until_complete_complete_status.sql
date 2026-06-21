-- ADHDice 6.7.6 data-contract foundation
-- Manual migration only. Do not assume this has been applied until you run it
-- yourself in the Supabase SQL editor for the target project.
--
-- This migration intentionally avoids changing runtime rollover or UI behavior.
-- It only prepares the durable data contract for a later implementation pass.
--
-- It is written to be idempotent where practical and to tolerate known enum
-- drift, especially older deployments that may still be missing `trashed`.

do $$
begin
  if to_regtype('public.adhdice_clean_task_status') is null then
    create type public.adhdice_clean_task_status as enum (
      'pending',
      'in_progress',
      'done',
      'missed',
      'did_my_best',
      'upcoming',
      'not_due',
      'archived',
      'trashed',
      'complete'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.adhdice_clean_task_status'::regtype
      and enumlabel = 'trashed'
  ) then
    alter type public.adhdice_clean_task_status add value 'trashed';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.adhdice_clean_task_status'::regtype
      and enumlabel = 'complete'
  ) then
    alter type public.adhdice_clean_task_status add value 'complete';
  end if;
end
$$;

do $$
begin
  if to_regtype('public.adhdice_clean_task_repeat_frequency') is null then
    create type public.adhdice_clean_task_repeat_frequency as enum (
      'none',
      'daily',
      'weekly',
      'monthly',
      'custom',
      'daily_until_complete'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.adhdice_clean_task_repeat_frequency'::regtype
      and enumlabel = 'daily_until_complete'
  ) then
    alter type public.adhdice_clean_task_repeat_frequency add value 'daily_until_complete';
  end if;
end
$$;

alter table public.adhdice_task_history
  add column if not exists event_type text not null default 'status',
  add column if not exists counted_as_due_occurrence boolean not null default false;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'adhdice_task_history_event_type_check'
      and conrelid = 'public.adhdice_task_history'::regclass
  ) then
    alter table public.adhdice_task_history
      drop constraint adhdice_task_history_event_type_check;
  end if;
end
$$;

alter table public.adhdice_task_history
  add constraint adhdice_task_history_event_type_check
    check (event_type in ('status', 'completed_permanently'));

comment on column public.adhdice_task_history.event_type is
  'History event kind. `status` is the existing occurrence-level row contract. `completed_permanently` is reserved for the permanent Complete action.';

comment on column public.adhdice_task_history.counted_as_due_occurrence is
  'When true on a `completed_permanently` row, the permanent completion also counted as that logical day''s successful due occurrence, so the calendar should render one Complete marker instead of separate Done + Complete markers.';

-- Manual follow-up after this file is reviewed:
-- 1. Run this script in the Supabase SQL editor for the target project.
-- 2. Regenerate database types if the team wants generated types to stay in
--    strict sync with the applied database contract.
-- 3. Only after the migration is applied should later runtime phases start
--    writing `status = ''complete''`, `repeat_frequency = ''daily_until_complete''`,
--    or `event_type = ''completed_permanently''`.

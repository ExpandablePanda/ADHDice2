-- ADHDice 6.13.9 data-contract foundation for persisted Delayed status.
-- Manual migration only. Do not assume this has been applied until you run it
-- yourself in the Supabase SQL editor for the target project.

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
      'delayed',
      'archived'
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
      and enumlabel = 'delayed'
  ) then
    alter type public.adhdice_clean_task_status add value 'delayed' after 'not_due';
  end if;
end
$$;

-- Manual follow-up after this file is reviewed:
-- 1. Run this script in the Supabase SQL editor for the target project.
-- 2. Update local TypeScript database types so `TaskStatus` includes `delayed`.
-- 3. Only after the migration is applied should runtime code persist
--    `status = 'delayed'`.

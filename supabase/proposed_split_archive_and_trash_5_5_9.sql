-- Proposed patch only for ADHDice 5.5.9.
-- Do not run this until the matching runtime follow-up is ready to ship.
--
-- Purpose:
-- 1. Keep `status = 'archived'` for a genuine Archive bucket.
-- 2. Add a separate soft-delete Trash state.
-- 3. Preserve existing user data by treating current `archived` rows as Trash,
--    because the live runtime currently uses `archived` as Trash.
--
-- This patch intentionally stops at schema/data preparation. After approval,
-- the runtime must be updated in the same release wave before this should be applied.

alter type public.adhdice_clean_task_status
  add value if not exists 'trashed';

alter table public.adhdice_clean_tasks
  add column if not exists trashed_at timestamptz;

comment on column public.adhdice_clean_tasks.trashed_at is
  'Timestamp for soft-deleted tasks that live in Trash before permanent deletion.';

update public.adhdice_clean_tasks
set
  status = 'trashed',
  trashed_at = coalesce(trashed_at, updated_at, now()),
  completed_at = null
where status = 'archived';

create index if not exists adhdice_clean_tasks_user_trashed_at_idx
  on public.adhdice_clean_tasks (user_id, trashed_at desc)
  where status = 'trashed';

-- Follow-up runtime contract after approval:
-- - Archive action: set status = 'archived', trashed_at = null.
-- - Delete action: set status = 'trashed', trashed_at = now(), completed_at = null.
-- - Restore from Trash: set status = 'pending', trashed_at = null.
-- - Restore from Archive: set status = 'pending', trashed_at = null.
-- - Permanent delete: only from status = 'trashed'.
-- - Auto-delete messaging/countdown: derive from trashed_at, not updated_at.
-- - Rollover/status SQL and runtime selectors must exclude both archived and trashed
--   from active-task routing once the application code is updated.

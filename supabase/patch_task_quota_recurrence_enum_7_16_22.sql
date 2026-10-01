-- ADHDice 7.16.22 quota recurrence enum preflight.
--
-- Apply and commit this migration before
-- patch_task_quota_recurrence_7_16_22.sql. PostgreSQL does not permit a new
-- enum label to be used by dependent DDL in the transaction that added it.

alter type public.adhdice_clean_task_repeat_frequency
  add value if not exists 'per_week';
alter type public.adhdice_clean_task_repeat_frequency
  add value if not exists 'per_month';

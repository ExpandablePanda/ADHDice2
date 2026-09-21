-- 7.14.41: choose whether a named Custom Task Type highlights task rows.
-- Source-only migration. Apply separately after review; do not run from source checkout.
alter table public.adhdice_custom_behavior_rulesets
  add column if not exists highlight_task_rows boolean not null default true;

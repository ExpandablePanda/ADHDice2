alter table public.adhdice_task_reward_claims
  add column if not exists subtask_id uuid references public.adhdice_task_subtasks(id) on delete cascade;

drop index if exists adhdice_task_reward_claims_task_idx;
drop index if exists adhdice_task_reward_claims_user_date_idx;

alter table public.adhdice_task_reward_claims
  drop constraint if exists adhdice_task_reward_claims_user_id_task_id_reward_date_key;

create index if not exists adhdice_task_reward_claims_user_date_idx
  on public.adhdice_task_reward_claims(user_id, reward_date desc, created_at desc);

create index if not exists adhdice_task_reward_claims_task_idx
  on public.adhdice_task_reward_claims(task_id);

create index if not exists adhdice_task_reward_claims_subtask_idx
  on public.adhdice_task_reward_claims(subtask_id);

create unique index if not exists adhdice_task_reward_claims_task_day_unique
  on public.adhdice_task_reward_claims(user_id, task_id, reward_date)
  where subtask_id is null;

create unique index if not exists adhdice_task_reward_claims_subtask_day_unique
  on public.adhdice_task_reward_claims(user_id, subtask_id, reward_date)
  where subtask_id is not null;

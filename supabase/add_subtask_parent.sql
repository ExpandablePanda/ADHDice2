alter table public.adhdice_task_subtasks
  add column if not exists parent_subtask_id uuid references public.adhdice_task_subtasks(id) on delete cascade;

create index if not exists adhdice_task_subtasks_parent_idx
  on public.adhdice_task_subtasks (parent_subtask_id);

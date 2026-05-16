-- Add explicit "none" energy level and make it the default for new tasks.

alter type public.adhdice_clean_task_energy add value if not exists 'none';

alter table public.adhdice_clean_tasks
  alter column energy set default 'none';

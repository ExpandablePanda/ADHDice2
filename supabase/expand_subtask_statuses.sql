alter type public.adhdice_clean_task_subtask_status add value if not exists 'in_progress';
alter type public.adhdice_clean_task_subtask_status add value if not exists 'missed';
alter type public.adhdice_clean_task_subtask_status add value if not exists 'did_my_best';
alter type public.adhdice_clean_task_subtask_status add value if not exists 'upcoming';
alter type public.adhdice_clean_task_subtask_status add value if not exists 'not_due';

-- ADHDice 6.26.0: additive learned-duration evidence metadata. Existing rows stay untrusted.
alter table public.adhdice_task_active_timers
  add column if not exists occurrence_key text,
  add column if not exists occurrence_due_on date;

alter table public.adhdice_task_actual_time_entries
  add column if not exists occurrence_key text,
  add column if not exists occurrence_due_on date,
  add column if not exists source text not null default 'legacy',
  add column if not exists estimate_eligible boolean not null default false,
  add column if not exists exclusion_reason text,
  add column if not exists completion_history_id uuid references public.adhdice_task_history(id) on delete set null,
  add column if not exists completion_completed_at timestamptz;

alter table public.adhdice_task_actual_time_entries
  drop constraint if exists adhdice_task_actual_time_entries_source_check;
alter table public.adhdice_task_actual_time_entries
  add constraint adhdice_task_actual_time_entries_source_check
  check (source in ('task_timer', 'manual', 'import', 'legacy'));

create index if not exists adhdice_task_actual_time_entries_learning_idx
  on public.adhdice_task_actual_time_entries (user_id, task_id, occurrence_key)
  where estimate_eligible and exclusion_reason is null and completion_history_id is not null;

create or replace function public.adhdice_link_task_timer_duration_evidence()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('done', 'did_my_best') and new.was_completed then
    update public.adhdice_task_actual_time_entries
      set completion_history_id = new.id,
          completion_completed_at = new.updated_at
      where user_id = new.user_id
        and task_id = new.task_id
        and source = 'task_timer'
        and estimate_eligible
        and exclusion_reason is null
        and completion_history_id is null
        and occurrence_key in ('occurrence:' || new.entry_date::text, 'lifetime:' || new.task_id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists adhdice_link_task_timer_duration_evidence on public.adhdice_task_history;
create trigger adhdice_link_task_timer_duration_evidence
  after insert or update of status, was_completed on public.adhdice_task_history
  for each row execute function public.adhdice_link_task_timer_duration_evidence();

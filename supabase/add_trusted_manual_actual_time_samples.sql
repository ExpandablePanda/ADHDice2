-- ADHDice 6.26.1: trust only new manual task-occurrence actual-time evidence.
-- This changes no existing user rows and is safe to rerun after 6.26.0.
create or replace function public.adhdice_link_task_duration_evidence()
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
        and source in ('task_timer', 'manual')
        and estimate_eligible
        and exclusion_reason is null
        and completion_history_id is null
        and occurrence_key in ('occurrence:' || new.entry_date::text, 'lifetime:' || new.task_id::text);
  end if;
  return new;
end;
$$;

create or replace function public.adhdice_link_inserted_task_duration_evidence()
returns trigger
language plpgsql
as $$
declare
  matching_completion public.adhdice_task_history%rowtype;
begin
  if new.source in ('task_timer', 'manual')
    and new.estimate_eligible
    and new.exclusion_reason is null
    and new.completion_history_id is null
    and new.occurrence_key is not null then
    select * into matching_completion
      from public.adhdice_task_history
      where user_id = new.user_id
        and task_id = new.task_id
        and status in ('done', 'did_my_best')
        and was_completed
        and new.occurrence_key in ('occurrence:' || entry_date::text, 'lifetime:' || task_id::text)
      order by updated_at desc
      limit 1;

    if found then
      new.completion_history_id = matching_completion.id;
      new.completion_completed_at = matching_completion.updated_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists adhdice_link_task_timer_duration_evidence on public.adhdice_task_history;
drop trigger if exists adhdice_link_task_duration_evidence on public.adhdice_task_history;
create trigger adhdice_link_task_duration_evidence
  after insert or update of status, was_completed on public.adhdice_task_history
  for each row execute function public.adhdice_link_task_duration_evidence();

drop trigger if exists adhdice_link_inserted_task_duration_evidence on public.adhdice_task_actual_time_entries;
create trigger adhdice_link_inserted_task_duration_evidence
  before insert on public.adhdice_task_actual_time_entries
  for each row execute function public.adhdice_link_inserted_task_duration_evidence();

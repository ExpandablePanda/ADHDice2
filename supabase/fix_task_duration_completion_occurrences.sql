-- ADHDice 6.26.2: keep completion action dates separate from scheduled occurrence identity.
-- No historical evidence backfill or user-specific repair is included.
alter table public.adhdice_task_history
  add column if not exists occurrence_key text,
  add column if not exists occurrence_due_on date;

create or replace function public.adhdice_capture_task_history_occurrence()
returns trigger
language plpgsql
as $$
declare
  target_task public.adhdice_clean_tasks%rowtype;
begin
  if new.status in ('done', 'did_my_best')
    and new.was_completed
    and new.occurrence_key is null then
    select * into target_task
      from public.adhdice_clean_tasks
      where id = new.task_id and user_id = new.user_id;

    if found then
      if target_task.repeat_frequency = 'none' then
        new.occurrence_key = 'lifetime:' || new.task_id::text;
        new.occurrence_due_on = null;
      else
        new.occurrence_due_on = coalesce(target_task.active_occurrence_due_on, new.entry_date);
        if new.occurrence_due_on is not null then
          new.occurrence_key = 'occurrence:' || new.occurrence_due_on::text;
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.adhdice_link_task_duration_evidence()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('done', 'did_my_best') and new.was_completed then
    update public.adhdice_task_actual_time_entries as evidence
      set completion_history_id = new.id,
          completion_completed_at = new.updated_at
      where evidence.user_id = new.user_id
        and evidence.task_id = new.task_id
        and evidence.source in ('task_timer', 'manual')
        and evidence.estimate_eligible
        and evidence.exclusion_reason is null
        and evidence.completion_history_id is null
        and (
          (new.occurrence_key is not null and evidence.occurrence_key = new.occurrence_key)
          or (
            new.occurrence_key is null
            and evidence.occurrence_key in ('occurrence:' || new.entry_date::text, 'lifetime:' || new.task_id::text)
          )
        );
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
      from public.adhdice_task_history as history
      where history.user_id = new.user_id
        and history.task_id = new.task_id
        and history.status in ('done', 'did_my_best')
        and history.was_completed
        and (
          history.occurrence_key = new.occurrence_key
          or (
            history.occurrence_key is null
            and new.occurrence_key in ('occurrence:' || history.entry_date::text, 'lifetime:' || history.task_id::text)
          )
        )
      order by history.updated_at desc
      limit 1;

    if found then
      new.completion_history_id = matching_completion.id;
      new.completion_completed_at = matching_completion.updated_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists adhdice_capture_task_history_occurrence on public.adhdice_task_history;
create trigger adhdice_capture_task_history_occurrence
  before insert or update of status, was_completed, occurrence_key, occurrence_due_on on public.adhdice_task_history
  for each row execute function public.adhdice_capture_task_history_occurrence();

drop trigger if exists adhdice_link_task_timer_duration_evidence on public.adhdice_task_history;
drop trigger if exists adhdice_link_task_duration_evidence on public.adhdice_task_history;
create trigger adhdice_link_task_duration_evidence
  after insert or update of status, was_completed, occurrence_key, occurrence_due_on on public.adhdice_task_history
  for each row execute function public.adhdice_link_task_duration_evidence();

drop trigger if exists adhdice_link_inserted_task_duration_evidence on public.adhdice_task_actual_time_entries;
create trigger adhdice_link_inserted_task_duration_evidence
  before insert on public.adhdice_task_actual_time_entries
  for each row execute function public.adhdice_link_inserted_task_duration_evidence();

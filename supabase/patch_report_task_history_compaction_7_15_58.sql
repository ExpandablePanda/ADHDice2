-- ADHDice 7.15.58 bounded Reports Task History read.
-- Source-only forward patch. Do not apply without explicit live SQL authorization.

begin;

create or replace function public.adhdice_get_report_task_history(
  p_start_date date,
  p_end_date date
)
returns table (
  entity_id uuid,
  logical_date date,
  outcome text,
  updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Report Task History requires an authenticated owner.'
      using errcode = '28000';
  end if;
  if p_start_date is null or p_end_date is null then
    raise exception 'Report Task History requires a bounded date range.'
      using errcode = '22023';
  end if;
  if p_start_date > p_end_date then
    raise exception 'Report Task History date range is inverted.'
      using errcode = '22023';
  end if;

  return query
    with current_tasks as (
      select task.id
        from public.adhdice_clean_tasks task
       where task.user_id = v_user_id
         and task.permanently_deleted_at is null
    ),
    baseline as (
      select latest.id,
             latest.entity_id,
             latest.logical_date,
             latest.outcome,
             latest.updated_at
        from current_tasks task
        cross join lateral (
          select fact.id,
                 fact.entity_id,
                 fact.logical_date,
                 fact.outcome::text as outcome,
                 fact.updated_at
            from public.adhdice_task_history_facts fact
           where fact.user_id = v_user_id
             and fact.entity_id = task.id
             and fact.logical_date < p_start_date
           order by fact.logical_date desc, fact.updated_at desc, fact.id desc
           limit 1
        ) latest
    ),
    ranged as (
      select fact.id,
             fact.entity_id,
             fact.logical_date,
             fact.outcome::text as outcome,
             fact.updated_at
        from public.adhdice_task_history_facts fact
       where fact.user_id = v_user_id
         and fact.logical_date >= p_start_date
         and fact.logical_date <= p_end_date
    ),
    combined as (
      select baseline.id, baseline.entity_id, baseline.logical_date, baseline.outcome, baseline.updated_at
        from baseline
      union all
      select ranged.id, ranged.entity_id, ranged.logical_date, ranged.outcome, ranged.updated_at
        from ranged
    )
    select combined.entity_id, combined.logical_date, combined.outcome, combined.updated_at
      from combined
     order by combined.logical_date, combined.updated_at, combined.id;
end;
$function$;

revoke all on function public.adhdice_get_report_task_history(date, date)
  from public, anon, authenticated;
grant execute on function public.adhdice_get_report_task_history(date, date)
  to authenticated;

notify pgrst, 'reload schema';

commit;

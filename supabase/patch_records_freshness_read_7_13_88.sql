-- ADHDice 7.13.88: narrow authenticated Records freshness read.
-- Source-only migration. Apply manually before browser QA.

begin;

create or replace function public.adhdice_get_latest_completed_records_run(
  p_rules_version text,
  p_timezone text,
  p_logical_day_start text
)
returns table (
  evaluated_at timestamptz,
  completed_at timestamptz,
  rules_version text,
  timezone text,
  logical_day_start time
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_logical_day_start time;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  begin
    v_logical_day_start := p_logical_day_start::time;
  exception when data_exception then
    raise exception 'Invalid logical day start.' using errcode = '22023';
  end;

  return query
  select
    run.evaluated_at,
    run.completed_at,
    run.rules_version,
    run.timezone,
    run.logical_day_start
  from public.adhdice_record_reconcile_runs as run
  where run.user_id = v_user_id
    and run.status = 'completed'
    and run.rules_version = p_rules_version
    and run.timezone = p_timezone
    and run.logical_day_start = v_logical_day_start
  order by run.evaluated_at desc, run.completed_at desc nulls last
  limit 1;
end;
$function$;

revoke all on function public.adhdice_get_latest_completed_records_run(text, text, text) from public;
revoke all on function public.adhdice_get_latest_completed_records_run(text, text, text) from anon;
grant execute on function public.adhdice_get_latest_completed_records_run(text, text, text) to authenticated;

commit;
